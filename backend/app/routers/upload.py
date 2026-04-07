import gc
import asyncio
import pandas as pd
import uuid
from pathlib import Path
from collections import OrderedDict
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.csv_profiler import profile_csv
from app.services.embeddings import ingest_dataset
from app.config import settings

router = APIRouter(prefix="/api", tags=["upload"])

# ---------------------------------------------------------------------------
# Supported file formats → parser map
# ---------------------------------------------------------------------------
SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".tsv", ".json", ".parquet"}


def _parse_upload(file: UploadFile) -> pd.DataFrame:
    """Parse an uploaded file into a DataFrame based on its extension."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )
    try:
        if ext == ".csv":
            return pd.read_csv(file.file)
        elif ext in (".xlsx", ".xls"):
            return pd.read_excel(file.file, engine="openpyxl" if ext == ".xlsx" else "xlrd")
        elif ext == ".tsv":
            return pd.read_csv(file.file, sep="\t")
        elif ext == ".json":
            return pd.read_json(file.file)
        elif ext == ".parquet":
            return pd.read_parquet(file.file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)}")
    # Unreachable but keeps mypy happy
    raise HTTPException(status_code=400, detail="Unknown parse error")

# ---------------------------------------------------------------------------
# In-memory dataset store with LRU eviction.
#
# Uses an OrderedDict so the oldest entry can be evicted when the store
# exceeds ``MAX_DATASETS``.  Each entry holds the full DataFrame, so
# keeping too many 40k-row datasets in memory is the #1 cause of the
# 25 GB RAM usage.
#
# Each dataset entry now also carries:
#   - "undo_stack": list[pd.DataFrame]  — previous versions (max 5)
#   - "mutation_log": list[str]         — human-readable log of applied mutations
# ---------------------------------------------------------------------------
MAX_DATASETS = 3  # keep at most 3 datasets in memory at once
MAX_UNDO = 5  # max number of undo snapshots per dataset
datasets: OrderedDict[str, dict] = OrderedDict()

# ---------------------------------------------------------------------------
# Pending mutation previews.
#
# When the agent proposes a data mutation, the preview is stored here
# keyed by preview_id.  The user must confirm (Apply) before the mutation
# is committed to the DataFrame.
# ---------------------------------------------------------------------------
pending_mutations: dict[str, dict] = {}


def _evict_if_needed() -> None:
    """Remove the oldest dataset(s) until we're under the limit."""
    while len(datasets) > MAX_DATASETS:
        evicted_id, evicted = datasets.popitem(last=False)
        # Drop the heavy DataFrame reference so GC can reclaim it
        evicted.pop("df", None)
        evicted.pop("profile", None)
        gc.collect()


def _touch(dataset_id: str) -> None:
    """Move *dataset_id* to the end (most recently used)."""
    if dataset_id in datasets:
        datasets.move_to_end(dataset_id)


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    df = _parse_upload(file)

    if len(df) > settings.MAX_CSV_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"CSV exceeds maximum of {settings.MAX_CSV_ROWS} rows"
        )

    dataset_id = str(uuid.uuid4())[:8]
    profile = profile_csv(df, file.filename)

    # Cache the profile dict so we don't rebuild it on every request
    profile_dict = profile.model_dump()

    # Store dataset and profile (with empty undo stack for versioning)
    datasets[dataset_id] = {
        "df": df,
        "profile": profile,
        "profile_dict": profile_dict,
        "filename": file.filename,
        "undo_stack": [],  # list[pd.DataFrame] — previous versions (max MAX_UNDO)
        "mutation_log": [],  # list[str] — human-readable log of applied mutations
    }
    _evict_if_needed()

    # Run embedding in a thread pool so we don't block the async event loop.
    # ingest_dataset is CPU-heavy (SentenceTransformer.encode) and takes
    # 5-10 s on a 40k-row dataset — blocking the event loop causes the HTTP
    # proxy to see an ECONNRESET.
    loop = asyncio.get_running_loop()
    num_chunks = await loop.run_in_executor(
        None, ingest_dataset, df, dataset_id, file.filename
    )

    return {
        "dataset_id": dataset_id,
        "profile": profile_dict,
        "chunks_embedded": num_chunks,
    }


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _touch(dataset_id)
    ds = datasets[dataset_id]
    return {
        "dataset_id": dataset_id,
        "profile": ds.get("profile_dict") or ds["profile"].model_dump(),
    }

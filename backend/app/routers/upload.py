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


def _clean_excel_df(df_raw: pd.DataFrame) -> pd.DataFrame:
    """Detect real headers in messy Excel files with title rows / merged cells.

    Many government and corporate .xlsx files have a structure like:
        Row 0: accessibility note or metadata
        Row 1: report title spanning all columns
        Row 2: header row part 1 (some cells, some NaN due to merged cells)
        Row 3: header row part 2 (year columns, sub-headers, etc.)
        Row 4+: actual data

    This function finds the real header row(s), merges multi-row headers into
    single column names, strips leading dots from cell values, and drops
    title/metadata rows above the header.
    """
    if df_raw.empty:
        return df_raw

    n_cols = len(df_raw.columns)
    n_rows = min(20, len(df_raw))  # scan at most first 20 rows

    # --- Step 1: Score each row to find where headers are ---
    # A "header row" has mostly non-null string values that are NOT numeric-looking.
    # A "data row" has mostly numeric values or numeric-looking strings.
    # A "title row" has 1-2 non-null cells spanning the width (low fill ratio).
    import re
    _NUM_PATTERN = re.compile(r'^[\s$€£¥-]*[\d,.]+%?$')  # matches "331,516,113", "$1,200", "0.25", etc.

    def _is_numeric_looking(val: object) -> bool:
        """True if the value is a number or a string that looks like a formatted number."""
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            return True
        if isinstance(val, str) and _NUM_PATTERN.match(val.strip()):
            return True
        return False

    def _row_profile(row_idx: int) -> dict:
        row = df_raw.iloc[row_idx]
        non_null = row.dropna()
        n_non_null = len(non_null)
        if n_non_null == 0:
            return {"type": "empty", "fill": 0.0}
        fill_ratio = n_non_null / n_cols
        n_num = sum(1 for v in non_null if _is_numeric_looking(v))
        n_text = n_non_null - n_num  # true descriptive text values
        num_ratio = n_num / n_non_null if n_non_null else 0
        text_ratio = n_text / n_non_null if n_non_null else 0
        # Title rows: very few cells filled (1-2 out of many columns)
        if fill_ratio < 0.3 and n_non_null <= 2:
            return {"type": "title", "fill": fill_ratio}
        # Data rows: majority of cells are numeric or numeric-looking
        if num_ratio >= 0.5:
            return {"type": "data", "fill": fill_ratio}
        # Header rows: mostly descriptive text, decent fill
        if text_ratio >= 0.3:
            return {"type": "header", "fill": fill_ratio}
        # Mixed — treat as potential header
        return {"type": "mixed", "fill": fill_ratio}

    profiles = [_row_profile(i) for i in range(n_rows)]

    # --- Step 2: Find the first header row ---
    header_start = None
    for i, p in enumerate(profiles):
        if p["type"] in ("header", "mixed") and p["fill"] >= 0.2:
            header_start = i
            break

    # If no header detected, return as-is (fallback to pandas default behavior)
    if header_start is None:
        return df_raw

    # --- Step 3: Determine if we have a multi-row header ---
    # Check rows after header_start: a sub-header row typically fills in
    # columns that were NaN in the header row (merged cells pattern) OR
    # has short label-like values (years, codes) complementing the main header.
    # Track cumulative coverage: once all columns are covered, stop.
    header_end = header_start
    covered_cols: set[int] = set()
    for j in range(n_cols):
        if pd.notna(df_raw.iloc[header_start, j]):
            covered_cols.add(j)

    for i in range(header_start + 1, min(header_start + 4, n_rows)):
        p = profiles[i]
        # If all columns are already covered by previous header rows,
        # any further row is data — stop.
        if len(covered_cols) >= n_cols:
            break

        if p["type"] == "data" and p["fill"] >= 0.5:
            # Looks numeric — but might be a sub-header with year labels.
            # Check complementary fill pattern: has values where previous
            # header rows had NaN → classic merged-cell sub-header.
            candidate_row = df_raw.iloc[i]
            candidate_vals = set(j for j in range(n_cols) if pd.notna(candidate_row.iloc[j]))
            uncovered = set(range(n_cols)) - covered_cols
            # Sub-header fills positions not yet covered
            fills_gaps = len(uncovered & candidate_vals) > 0
            # Sub-header values are short labels (years, codes, etc.)
            non_null_vals = [candidate_row.iloc[j] for j in range(n_cols) if pd.notna(candidate_row.iloc[j])]
            all_short = all(len(str(v)) <= 20 for v in non_null_vals)
            # Complementary: doesn't fill ALL columns (that would be data)
            is_complementary = len(candidate_vals) < n_cols * 0.9
            if fills_gaps and all_short and is_complementary:
                header_end = i
                covered_cols |= candidate_vals
                continue
            break  # genuine data row
        elif p["type"] in ("header", "mixed"):
            header_end = i
            for j in range(n_cols):
                if pd.notna(df_raw.iloc[i, j]):
                    covered_cols.add(j)
        else:
            break  # hit empty or title row — stop

    header_rows = list(range(header_start, header_end + 1))
    data_start = header_end + 1

    # --- Step 4: Build merged column names from multi-row header ---
    col_names = []
    for col_idx in range(n_cols):
        parts = []
        for row_idx in header_rows:
            val = df_raw.iloc[row_idx, col_idx]
            if pd.notna(val):
                s = str(val).strip()
                # Skip "Unnamed" artifacts
                if s and not s.startswith("Unnamed"):
                    parts.append(s)
        name = " - ".join(parts) if parts else f"Column_{col_idx + 1}"
        col_names.append(name)

    # Deduplicate column names
    seen: dict[str, int] = {}
    for i, name in enumerate(col_names):
        if name in seen:
            seen[name] += 1
            col_names[i] = f"{name}_{seen[name]}"
        else:
            seen[name] = 0

    # --- Step 5: Build the clean DataFrame ---
    if data_start >= len(df_raw):
        # Edge case: all rows were headers
        return pd.DataFrame(columns=pd.Index(col_names))

    clean_df = df_raw.iloc[data_start:].copy()
    clean_df.columns = pd.Index(col_names)
    clean_df = clean_df.reset_index(drop=True)

    # --- Step 6: Clean up values ---
    # Strip leading dots from string cells (common in Census/BLS data
    # where dots indicate sub-categories, e.g. ".Abilene, TX Metro Area")
    for col in clean_df.columns:
        if clean_df[col].dtype == object:
            clean_df[col] = clean_df[col].apply(
                lambda v: v.lstrip(".") if isinstance(v, str) else v
            )

    # Try to convert columns with comma-formatted numbers to numeric.
    # E.g. "331,516,113" → 331516113. Only convert columns where most
    # non-null values are numeric-looking strings.
    for col in clean_df.columns:
        if clean_df[col].dtype != object:
            continue
        non_null = clean_df[col].dropna()
        if len(non_null) == 0:
            continue
        n_numeric = sum(1 for v in non_null if isinstance(v, str) and _NUM_PATTERN.match(v.strip()))
        if n_numeric / len(non_null) >= 0.8:
            # Most values are numeric-looking — convert
            clean_df[col] = clean_df[col].apply(
                lambda v: v.replace(",", "") if isinstance(v, str) else v
            )
            clean_df[col] = pd.to_numeric(clean_df[col], errors="coerce")

    # Drop fully-empty rows (e.g. spacer rows, footnotes at the bottom)
    clean_df = clean_df.dropna(how="all").reset_index(drop=True)

    # Drop footnote/source rows at the bottom — these typically have text
    # in column 0 and NaN in all numeric columns.
    # Only check if we have at least some data rows.
    if len(clean_df) > 5 and len(col_names) > 2:
        # Find the last contiguous block of data rows (non-null in 2+ columns)
        last_good = len(clean_df) - 1
        for i in range(len(clean_df) - 1, -1, -1):
            row = clean_df.iloc[i]
            non_null_count = row.dropna().shape[0]
            if non_null_count >= 2:
                last_good = i
                break
        if last_good < len(clean_df) - 1:
            clean_df = clean_df.iloc[: last_good + 1].reset_index(drop=True)

    return clean_df


def _needs_header_detection(df: pd.DataFrame) -> bool:
    """Check if a DataFrame from read_excel has garbage headers.

    Signals: majority of column names are 'Unnamed: N', or the first column
    name is suspiciously long (title row used as header).
    """
    col_strs = [str(c) for c in df.columns]
    unnamed_count = sum(1 for c in col_strs if c.startswith("Unnamed:"))
    if unnamed_count >= len(col_strs) / 2:
        return True
    # First column is a long sentence (title row captured as header)
    if len(col_strs) > 0 and len(col_strs[0]) > 80:
        return True
    return False


def _parse_upload(file: UploadFile) -> pd.DataFrame:
    """Parse an uploaded file into a DataFrame based on its extension."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )
    try:
        # Reset file position — SpooledTemporaryFile may have been partially
        # read by FastAPI/Starlette for content-type sniffing.
        file.file.seek(0)

        if ext == ".csv":
            df = pd.read_csv(file.file)
            if _needs_header_detection(df):
                file.file.seek(0)
                df_raw = pd.read_csv(file.file, header=None)
                df = _clean_excel_df(df_raw)
            return df
        elif ext in (".xlsx", ".xls"):
            # openpyxl needs a seekable bytes buffer; read the entire upload
            # into a BytesIO to avoid issues with SpooledTemporaryFile.
            import io
            content = file.file.read()
            buf = io.BytesIO(content)
            engine = "openpyxl" if ext == ".xlsx" else "xlrd"
            df = pd.read_excel(buf, engine=engine)

            # Detect messy headers (title rows, merged cells, etc.)
            if _needs_header_detection(df):
                buf.seek(0)
                df_raw = pd.read_excel(buf, header=None, engine=engine)
                df = _clean_excel_df(df_raw)

            return df
        elif ext == ".tsv":
            df = pd.read_csv(file.file, sep="\t")
            if _needs_header_detection(df):
                file.file.seek(0)
                df_raw = pd.read_csv(file.file, sep="\t", header=None)
                df = _clean_excel_df(df_raw)
            return df
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
    # ingest_dataset is CPU-heavy (fastembed ONNX encode) and takes
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

import pandas as pd
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.csv_profiler import profile_csv
from app.services.embeddings import ingest_dataset
from app.config import settings

router = APIRouter(prefix="/api", tags=["upload"])

# In-memory dataset store (for MVP — swap to proper storage later)
datasets: dict[str, dict] = {}


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        df = pd.read_csv(file.file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {str(e)}")

    if len(df) > settings.MAX_CSV_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"CSV exceeds maximum of {settings.MAX_CSV_ROWS} rows"
        )

    dataset_id = str(uuid.uuid4())[:8]
    profile = profile_csv(df, file.filename)

    # Store dataset and profile
    datasets[dataset_id] = {
        "df": df,
        "profile": profile,
        "filename": file.filename,
    }

    num_chunks = ingest_dataset(df, dataset_id, file.filename)

    return {
        "dataset_id": dataset_id,
        "profile": profile.model_dump(),
        "chunks_embedded": num_chunks,
    }


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return {
        "dataset_id": dataset_id,
        "profile": datasets[dataset_id]["profile"].model_dump(),
    }

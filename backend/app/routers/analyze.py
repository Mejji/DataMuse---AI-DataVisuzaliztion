import traceback
from fastapi import APIRouter, HTTPException
from app.services.llm_service import suggest_visualizations
from app.routers.upload import datasets

router = APIRouter(prefix="/api", tags=["analyze"])


@router.get("/analyze/{dataset_id}")
async def analyze_dataset(dataset_id: str):
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = datasets[dataset_id]
    profile = dataset["profile"].model_dump()
    sample_rows = profile["sample_rows"]

    try:
        suggestions = suggest_visualizations(profile, sample_rows)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

    return {
        "dataset_id": dataset_id,
        "suggestions": suggestions,
    }

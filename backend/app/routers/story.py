import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.llm_service import generate_story_draft
from app.routers.upload import datasets
from app.routers.chat import conversations

router = APIRouter(prefix="/api", tags=["story"])


class StoryRequest(BaseModel):
    dataset_id: str
    pinned_insights: list[str] = []  # User-pinned insights from chat


@router.post("/story/generate")
async def generate_story(request: StoryRequest):
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = datasets[request.dataset_id]
    profile = dataset["profile"].model_dump()

    # Combine pinned insights with conversation highlights
    insights = list(request.pinned_insights)
    history = conversations.get(request.dataset_id, [])
    for msg in history:
        if msg["role"] == "assistant":
            insights.append(msg["content"][:200])

    # If no insights, add basic ones from profile
    if not insights:
        insights.append(f"Dataset has {profile.get('row_count', 'unknown')} rows and {profile.get('column_count', 'unknown')} columns.")
        for col in profile.get("columns", []):
            if col.get("mean") is not None:
                insights.append(f"{col['name']}: average {col['mean']}, range {col.get('min_val', '?')} to {col.get('max_val', '?')}")

    try:
        story = generate_story_draft(profile, insights)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Story generation error: {str(e)}")

    return story


@router.post("/story/save")
async def save_story(story: dict):
    # For MVP: just return it back. Later: persist to DB
    return {"status": "saved", "story": story}

import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.llm_service import generate_story_draft, refine_chapter_text
from app.services.data_tools import create_chart_data
from app.routers.upload import datasets, _touch
from app.routers.chat import conversations

router = APIRouter(prefix="/api", tags=["story"])

# ── Story angle presets ──────────────────────────────────────────────
STORY_ANGLES = [
    {
        "id": "overview",
        "label": "Executive Overview",
        "description": "High-level summary with key metrics and takeaways",
        "prompt_hint": "Write an executive summary — focus on the big numbers, key trends, and actionable takeaways. Keep it concise and business-friendly.",
    },
    {
        "id": "trends",
        "label": "Trends & Patterns",
        "description": "Focus on how things changed over time",
        "prompt_hint": "Focus on time-based trends, seasonal patterns, growth rates, and inflection points. Show what's changing and in which direction.",
    },
    {
        "id": "comparison",
        "label": "Category Comparison",
        "description": "Compare groups, segments, or categories side-by-side",
        "prompt_hint": "Compare the main categories or groups in the data. Highlight winners, losers, and surprising gaps between segments.",
    },
    {
        "id": "deep_dive",
        "label": "Deep Dive Analysis",
        "description": "Detailed exploration of correlations and outliers",
        "prompt_hint": "Go deep — look for correlations, outliers, anomalies, and non-obvious patterns. Be analytical and thorough.",
    },
    {
        "id": "custom",
        "label": "Custom Story",
        "description": "Tell the AI exactly what angle you want",
        "prompt_hint": "",
    },
]


class StoryRequest(BaseModel):
    dataset_id: str
    pinned_insights: list[str] = []
    angle: str = ""        # angle id or empty for default
    custom_prompt: str = ""  # user's custom instructions


class RefineRequest(BaseModel):
    dataset_id: str
    chapter_title: str
    chapter_narrative: str
    user_instruction: str  # e.g. "make it shorter", "add percentages", "focus on Q4"


@router.get("/story/angles")
async def get_story_angles():
    """Return available story angles/themes."""
    return {"angles": STORY_ANGLES}


@router.post("/story/refine")
async def refine_chapter(request: RefineRequest):
    """Use AI to refine a single chapter based on user instructions."""
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _touch(request.dataset_id)
    dataset = datasets[request.dataset_id]
    profile = dataset.get("profile_dict") or dataset["profile"].model_dump()

    try:
        result = refine_chapter_text(
            profile=profile,
            chapter_title=request.chapter_title,
            chapter_narrative=request.chapter_narrative,
            user_instruction=request.user_instruction,
        )
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Refine error: {str(e)}")


@router.post("/story/generate")
async def generate_story(request: StoryRequest):
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _touch(request.dataset_id)
    dataset = datasets[request.dataset_id]
    profile = dataset.get("profile_dict") or dataset["profile"].model_dump()
    df = dataset["df"]

    # Build angle hint
    angle_hint = ""
    if request.custom_prompt:
        angle_hint = request.custom_prompt
    elif request.angle:
        for a in STORY_ANGLES:
            if a["id"] == request.angle:
                angle_hint = a["prompt_hint"]
                break

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
        story = generate_story_draft(profile, insights, angle_hint=angle_hint)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Story generation error: {str(e)}")

    # Convert chapter query specs into real chart configs using the DataFrame
    if isinstance(story, dict) and "chapters" in story:
        for chapter in story["chapters"]:
            try:
                # If chapter already has a chart_config with data, keep it
                existing_config = chapter.get("chart_config")
                if (isinstance(existing_config, dict)
                        and isinstance(existing_config.get("data"), list)
                        and len(existing_config["data"]) > 0):
                    continue

                chart_type = chapter.get("chart_type")
                x_column = chapter.get("x_column")
                y_columns = chapter.get("y_columns")

                if not chart_type or not x_column or not y_columns:
                    # No query spec provided, remove empty chart_config
                    chapter.pop("chart_config", None)
                    continue

                group_by = chapter.get("group_by")
                aggregation = chapter.get("aggregation", "sum")
                filters = chapter.get("filters", [])
                limit = chapter.get("limit", 20)
                colors = chapter.get("colors")

                chart_config = create_chart_data(
                    df=df,
                    chart_type=chart_type,
                    x_column=x_column,
                    y_columns=y_columns,
                    group_by=group_by if isinstance(group_by, str) else None,
                    aggregation=aggregation,
                    filters=filters if isinstance(filters, list) else None,
                    limit=limit,
                    colors=colors if isinstance(colors, list) else None,
                )

                if "error" in chart_config:
                    print(f"[story] Chart error for chapter '{chapter.get('title')}': {chart_config['error']}")
                    chapter.pop("chart_config", None)
                else:
                    # Override title with chapter title
                    if chapter.get("title"):
                        chart_config["title"] = chapter["title"]
                    chapter["chart_config"] = chart_config

                # Clean up query spec fields from the chapter
                for key in ["chart_type", "x_column", "y_columns", "group_by",
                            "aggregation", "filters", "limit", "colors"]:
                    chapter.pop(key, None)

            except Exception as e:
                print(f"[story] Failed to build chart for chapter '{chapter.get('title', '?')}': {e}")
                traceback.print_exc()
                chapter.pop("chart_config", None)

    return story


@router.post("/story/save")
async def save_story(story: dict):
    # For MVP: just return it back. Later: persist to DB
    return {"status": "saved", "story": story}

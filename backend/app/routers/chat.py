import traceback
from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatMessage
from app.services.llm_service import chat_with_muse
from app.routers.upload import datasets, _touch
from datetime import datetime

router = APIRouter(prefix="/api", tags=["chat"])

# In-memory conversation store (per dataset).
# Capped at MAX_HISTORY messages to avoid unbounded memory growth.
MAX_HISTORY = 40
conversations: dict[str, list[dict]] = {}


@router.post("/chat")
async def chat(request: ChatRequest):
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found. Upload a CSV first.")

    _touch(request.dataset_id)  # mark this dataset as recently used
    dataset = datasets[request.dataset_id]

    # Use cached profile dict if available (avoids re-serialising every call)
    profile = dataset.get("profile_dict") or dataset["profile"].model_dump()

    # Get or create conversation history
    history = conversations.get(request.dataset_id, [])

    try:
        result = chat_with_muse(
            user_message=request.message,
            dataset_id=request.dataset_id,
            profile=profile,
            df=dataset["df"],  # Pass the actual DataFrame
            conversation_history=history,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

    # Store conversation (cap to MAX_HISTORY to avoid unbounded growth)
    history.append({"role": "user", "content": request.message})
    history.append({"role": "assistant", "content": result["content"]})
    if len(history) > MAX_HISTORY:
        history = history[-MAX_HISTORY:]
    conversations[request.dataset_id] = history

    return ChatMessage(
        role="muse",
        content=result["content"],
        chart_config=result.get("chart_config"),
        table_config=result.get("table_config"),
        recommended_charts=result.get("recommended_charts"),
        mutation_preview=result.get("mutation_preview"),
        timestamp=datetime.now().isoformat(),
    )

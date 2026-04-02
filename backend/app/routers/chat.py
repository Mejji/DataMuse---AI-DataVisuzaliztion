import traceback
from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatMessage
from app.services.llm_service import chat_with_muse
from app.routers.upload import datasets
from datetime import datetime

router = APIRouter(prefix="/api", tags=["chat"])

# In-memory conversation store (per dataset)
conversations: dict[str, list[dict]] = {}


@router.post("/chat")
async def chat(request: ChatRequest):
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found. Upload a CSV first.")

    dataset = datasets[request.dataset_id]
    profile = dataset["profile"].model_dump()

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

    # Store conversation
    history.append({"role": "user", "content": request.message})
    history.append({"role": "assistant", "content": result["content"]})
    conversations[request.dataset_id] = history

    return ChatMessage(
        role="muse",
        content=result["content"],
        chart_config=result.get("chart_config"),
        timestamp=datetime.now().isoformat(),
    )

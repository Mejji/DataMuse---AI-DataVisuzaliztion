import json
from groq import Groq
from app.config import settings
from app.services.muse_prompts import (
    MUSE_SYSTEM_PROMPT,
    VISUALIZATION_SUGGESTION_PROMPT,
    STORY_DRAFT_PROMPT,
)
from app.services.embeddings import embed_text
from app.services.qdrant_service import search
from app.services.data_tools import TOOL_DEFINITIONS, execute_tool

groq_client = Groq(api_key=settings.GROQ_API_KEY)


def chat_with_muse(
    user_message: str,
    dataset_id: str,
    profile: dict,
    df,  # pandas DataFrame — the actual data
    conversation_history: list[dict] = None,
) -> dict:
    """Send a message to Muse with function calling support."""
    # RAG: retrieve relevant context from Qdrant
    collection_name = f"dataset_{dataset_id}"
    query_vector = embed_text(user_message)
    relevant_chunks = search(collection_name, query_vector, limit=5)
    context = "\n".join([p.payload["text"] for p in relevant_chunks])

    # Build messages
    messages = [{"role": "system", "content": MUSE_SYSTEM_PROMPT}]

    # Add conversation history
    if conversation_history:
        messages.extend(conversation_history[-10:])

    # Add current message with RAG context
    enriched_message = (
        f"User question: {user_message}\n\n"
        f"Dataset context (from vector search):\n{context}\n\n"
        f"Dataset columns: {json.dumps(profile.get('columns', []), default=str)[:1500]}\n"
        f"Row count: {profile.get('row_count', 'unknown')}"
    )
    messages.append({"role": "user", "content": enriched_message})

    # Call with tools
    try:
        response = groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=2048,
        )
    except Exception as e:
        # If tool calling itself fails (e.g. Groq rejects the format),
        # retry without tools — let Muse answer from context alone
        if "tool_use_failed" in str(e) or "tool" in str(e).lower():
            response = groq_client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=2048,
            )
        else:
            raise

    msg = response.choices[0].message
    chart_config = None

    # Tool call loop — Muse may call multiple tools
    max_iterations = 5
    iteration = 0
    while msg.tool_calls and iteration < max_iterations:
        iteration += 1

        # Convert assistant message with tool_calls to dict for Groq
        assistant_msg = {
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in msg.tool_calls
            ],
        }
        messages.append(assistant_msg)

        for tool_call in msg.tool_calls:
            tool_name = tool_call.function.name
            try:
                arguments = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                arguments = {}

            try:
                tool_result = execute_tool(tool_name, arguments, df)
            except Exception as e:
                tool_result = {"error": f"Tool execution failed: {str(e)}"}

            # If tool returned a chart config, capture it
            if tool_name == "create_chart" and "error" not in tool_result:
                chart_config = tool_result

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(tool_result, default=str)[:3000],
            })

        # Get next response
        try:
            response = groq_client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                temperature=0.7,
                max_tokens=2048,
            )
        except Exception as e:
            if "tool_use_failed" in str(e) or "tool" in str(e).lower():
                response = groq_client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=2048,
                )
            else:
                raise
        msg = response.choices[0].message

    text_content = msg.content or ""

    return {
        "content": text_content,
        "chart_config": chart_config,
    }


def suggest_visualizations(profile: dict, sample_rows: list[dict]) -> list[dict]:
    """Get AI-suggested visualizations for a dataset."""
    prompt = VISUALIZATION_SUGGESTION_PROMPT.format(
        profile=json.dumps(profile, default=str)[:3000],
        sample_rows=json.dumps(sample_rows[:5], default=str)[:1000],
    )

    try:
        response = groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": MUSE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=3000,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        print(f"[suggest_visualizations] First attempt failed: {e}")
        # Retry without response_format
        response = groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are a data visualization assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=3000,
        )

    raw = response.choices[0].message.content
    print(f"[DEBUG suggest_visualizations] Raw LLM response (first 500 chars): {raw[:500]}")

    try:
        result = json.loads(raw)
        print(f"[DEBUG suggest_visualizations] Parsed type: {type(result).__name__}, keys: {list(result.keys()) if isinstance(result, dict) else 'N/A'}")
        if isinstance(result, dict) and "visualizations" in result:
            return result["visualizations"]
        if isinstance(result, dict) and "suggestions" in result:
            return result["suggestions"]
        if isinstance(result, list):
            return result
        # If it's a dict with other keys, try to find any list value
        if isinstance(result, dict):
            for k, v in result.items():
                if isinstance(v, list) and len(v) > 0:
                    print(f"[DEBUG suggest_visualizations] Found list under key '{k}' with {len(v)} items")
                    return v
        return []
    except json.JSONDecodeError as e:
        print(f"[DEBUG suggest_visualizations] JSON parse error: {e}")
        # Try to extract JSON from the response
        import re
        json_match = re.search(r'\[.*\]', raw, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        return []


def generate_story_draft(profile: dict, insights: list[str]) -> dict:
    """Generate a story draft from dataset insights."""
    prompt = STORY_DRAFT_PROMPT.format(
        profile=json.dumps(profile, default=str)[:3000],
        insights="\n".join(insights[:10]),
    )

    response = groq_client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": MUSE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=4000,
        response_format={"type": "json_object"},
    )

    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        return {"title": "Your Data Story", "chapters": []}

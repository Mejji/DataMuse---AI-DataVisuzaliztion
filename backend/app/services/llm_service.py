import json
import re
import traceback
import threading
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

# ---------------------------------------------------------------------------
# Groq client
# ---------------------------------------------------------------------------
groq_client = Groq(api_key=settings.GROQ_API_KEY)

# ---------------------------------------------------------------------------
# Model Load Balancer
#
# Each Groq free-tier model has INDEPENDENT rate limits (~1K RPD each).
# By round-robin rotating across 5 models, we get ~18K+ requests/day.
# On a 429 (rate limit), we mark that model exhausted and skip to the next.
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_current_model_index = 0
_exhausted_models: set[str] = set()  # models that hit 429 this session


def _get_next_model() -> str | None:
    """Return the next available model via round-robin. Skip exhausted ones.
    Returns None if ALL models are exhausted."""
    global _current_model_index
    pool = settings.GROQ_MODEL_POOL
    pool_size = len(pool)

    with _lock:
        # Try each model in the pool starting from current index
        for _ in range(pool_size):
            model = pool[_current_model_index % pool_size]
            _current_model_index = (_current_model_index + 1) % pool_size
            if model not in _exhausted_models:
                return model

    return None  # all models exhausted


def _mark_exhausted(model: str) -> None:
    """Mark a model as rate-limited for this process lifetime."""
    with _lock:
        _exhausted_models.add(model)
    print(f"[load-balancer] Model '{model}' rate-limited. "
          f"Exhausted: {len(_exhausted_models)}/{len(settings.GROQ_MODEL_POOL)}")


def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True if the exception indicates a rate-limit."""
    msg = str(exc).lower()
    return any(
        phrase in msg
        for phrase in [
            "rate_limit",
            "rate limit",
            "429",
            "too many requests",
            "tokens per day",
            "requests per day",
            "limit reached",
        ]
    )


# ---------------------------------------------------------------------------
# Core completion with load-balanced failover
# ---------------------------------------------------------------------------
def _groq_completion(*, model: str, messages: list, tools=None,
                     tool_choice=None, temperature: float = 0.7,
                     max_tokens: int = 2048, response_format=None):
    """Call Groq with a specific model. Raises on error."""
    kwargs: dict = dict(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice or "auto"
    if response_format:
        kwargs["response_format"] = response_format
    return groq_client.chat.completions.create(**kwargs)


def _completion_with_failover(*, messages: list, tools=None,
                              tool_choice=None, temperature: float = 0.7,
                              max_tokens: int = 2048, response_format=None,
                              label: str = ""):
    """Try models round-robin. On 429, failover to next model in pool.

    Also handles Groq quirks: tool_use_failed retries without tools,
    response_format ConnectionError retries without response_format.
    """
    attempts = 0
    last_error: Exception | None = None

    while attempts < len(settings.GROQ_MODEL_POOL):
        model = _get_next_model()
        if model is None:
            break  # all models exhausted

        attempts += 1
        print(f"[{label}] Using model: {model}")

        try:
            return _groq_completion(
                model=model, messages=messages, tools=tools,
                tool_choice=tool_choice, temperature=temperature,
                max_tokens=max_tokens, response_format=response_format,
            )
        except Exception as e:
            last_error = e

            if _is_rate_limit_error(e):
                _mark_exhausted(model)
                continue  # try next model

            # Groq tool_use_failed — retry same model without tools
            if ("tool_use_failed" in str(e) or "tool" in str(e).lower()) and tools:
                print(f"[{label}] tool_use_failed on {model} — retrying without tools")
                try:
                    return _groq_completion(
                        model=model, messages=messages,
                        temperature=temperature, max_tokens=max_tokens,
                    )
                except Exception as e2:
                    if _is_rate_limit_error(e2):
                        _mark_exhausted(model)
                        continue
                    raise

            # response_format ConnectionError — retry without it
            if response_format and "ConnectionError" in type(e).__name__:
                print(f"[{label}] response_format error on {model} — retrying without it")
                try:
                    return _groq_completion(
                        model=model, messages=messages, tools=tools,
                        tool_choice=tool_choice, temperature=temperature,
                        max_tokens=max_tokens,
                    )
                except Exception as e2:
                    if _is_rate_limit_error(e2):
                        _mark_exhausted(model)
                        continue
                    raise

            # Non-rate-limit error — don't failover, raise immediately
            raise

    # All models exhausted
    raise RuntimeError(
        f"All {len(settings.GROQ_MODEL_POOL)} Groq models are rate-limited. "
        f"Please wait for limits to reset (daily). "
        f"Last error: {last_error}"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def chat_with_muse(
    user_message: str,
    dataset_id: str,
    profile: dict,
    df,  # pandas DataFrame — the actual data
    conversation_history: list[dict] | None = None,
) -> dict:
    """Send a message to Muse with function calling support."""
    # RAG: retrieve relevant context from Qdrant
    collection_name = f"dataset_{dataset_id}"
    query_vector = embed_text(user_message)
    relevant_chunks = search(collection_name, query_vector, limit=5)
    context = "\n".join([p.payload["text"] for p in relevant_chunks])

    # Build messages
    messages: list[dict] = [{"role": "system", "content": MUSE_SYSTEM_PROMPT}]

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

    # Call with tools (load-balanced across model pool)
    response = _completion_with_failover(
        messages=messages,
        tools=TOOL_DEFINITIONS,
        tool_choice="auto",
        temperature=0.7,
        max_tokens=2048,
        label="chat_with_muse",
    )

    msg = response.choices[0].message
    chart_config = None

    # Tool call loop — Muse may call multiple tools
    max_iterations = 5
    iteration = 0
    while msg.tool_calls and iteration < max_iterations:
        iteration += 1

        # Convert assistant message with tool_calls to dict
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

        # Get next response (load-balanced)
        response = _completion_with_failover(
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=2048,
            label="chat_with_muse:loop",
        )
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
        response = _completion_with_failover(
            messages=[
                {"role": "system", "content": MUSE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=3000,
            response_format={"type": "json_object"},
            label="suggest_visualizations",
        )
    except Exception as e:
        print(f"[suggest_visualizations] All attempts failed: {e}")
        # Last-ditch: try without response_format
        response = _completion_with_failover(
            messages=[
                {"role": "system", "content": "You are a data visualization assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=3000,
            label="suggest_visualizations:fallback",
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

    try:
        response = _completion_with_failover(
            messages=[
                {"role": "system", "content": MUSE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=4000,
            response_format={"type": "json_object"},
            label="generate_story_draft",
        )
    except Exception as e:
        print(f"[generate_story_draft] All attempts failed: {e}")
        # Last-ditch without response_format
        response = _completion_with_failover(
            messages=[
                {"role": "system", "content": "You are a data storytelling assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=4000,
            label="generate_story_draft:fallback",
        )

    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        return {"title": "Your Data Story", "chapters": []}

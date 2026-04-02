import json
import re
import traceback
from groq import Groq
from openai import OpenAI
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
# Clients
# ---------------------------------------------------------------------------
groq_client = Groq(api_key=settings.GROQ_API_KEY)

openrouter_client: OpenAI | None = None
if settings.OPENROUTER_API_KEY:
    openrouter_client = OpenAI(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=settings.OPENROUTER_API_KEY,
    )

# Track which provider is active so we can skip Groq after a rate-limit hit
# within the same process lifetime (resets on restart).
_groq_rate_limited = False


# ---------------------------------------------------------------------------
# Rate-limit detection
# ---------------------------------------------------------------------------
def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True if the exception indicates a Groq rate-limit."""
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
# Unified completion helpers
# ---------------------------------------------------------------------------
def _groq_completion(*, messages, tools=None, tool_choice=None,
                     temperature=0.7, max_tokens=2048, response_format=None):
    """Call Groq and return the response. Raises on error."""
    kwargs = dict(
        model=settings.GROQ_MODEL,
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


def _openrouter_completion(*, messages, tools=None, tool_choice=None,
                           temperature=0.7, max_tokens=2048, response_format=None):
    """Call OpenRouter and return the response. Raises on error."""
    if openrouter_client is None:
        raise RuntimeError("OpenRouter client not configured — set OPENROUTER_API_KEY")

    kwargs = dict(
        model=settings.OPENROUTER_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice or "auto"
    # OpenRouter may not support response_format for all models — try with it,
    # and if it fails we'll catch it downstream.
    if response_format:
        kwargs["response_format"] = response_format

    return openrouter_client.chat.completions.create(**kwargs)


def _completion_with_fallback(*, messages, tools=None, tool_choice=None,
                              temperature=0.7, max_tokens=2048,
                              response_format=None, label=""):
    """Try Groq first; on rate-limit, fall back to OpenRouter.

    Also handles Groq-specific quirks (tool_use_failed, response_format
    ConnectionError) with retries before giving up on Groq entirely.
    """
    global _groq_rate_limited

    # ---- Try Groq (unless already rate-limited this session) ----
    if not _groq_rate_limited:
        try:
            return _groq_completion(
                messages=messages, tools=tools, tool_choice=tool_choice,
                temperature=temperature, max_tokens=max_tokens,
                response_format=response_format,
            )
        except Exception as e:
            if _is_rate_limit_error(e):
                print(f"[{label}] Groq rate-limited. Switching to OpenRouter fallback.")
                _groq_rate_limited = True
                # fall through to OpenRouter
            elif ("tool_use_failed" in str(e) or "tool" in str(e).lower()) and tools:
                # Groq sometimes rejects tool calls; retry without tools
                print(f"[{label}] Groq tool_use_failed — retrying without tools")
                try:
                    return _groq_completion(
                        messages=messages, temperature=temperature,
                        max_tokens=max_tokens,
                    )
                except Exception as e2:
                    if _is_rate_limit_error(e2):
                        print(f"[{label}] Groq rate-limited on retry. Switching to OpenRouter.")
                        _groq_rate_limited = True
                    else:
                        raise
            elif response_format and "ConnectionError" in type(e).__name__:
                # Groq response_format sometimes causes ConnectionError
                print(f"[{label}] Groq response_format error — retrying without it")
                try:
                    return _groq_completion(
                        messages=messages, tools=tools, tool_choice=tool_choice,
                        temperature=temperature, max_tokens=max_tokens,
                    )
                except Exception as e2:
                    if _is_rate_limit_error(e2):
                        _groq_rate_limited = True
                    else:
                        raise
            else:
                raise

    # ---- Fallback: OpenRouter ----
    if openrouter_client is None:
        raise RuntimeError(
            "Groq rate-limited and no OpenRouter fallback configured. "
            "Set OPENROUTER_API_KEY in your .env file."
        )

    print(f"[{label}] Using OpenRouter ({settings.OPENROUTER_MODEL})")
    try:
        return _openrouter_completion(
            messages=messages, tools=tools, tool_choice=tool_choice,
            temperature=temperature, max_tokens=max_tokens,
            response_format=response_format,
        )
    except Exception as e:
        # If response_format fails on OpenRouter, retry without it
        if response_format:
            print(f"[{label}] OpenRouter failed with response_format — retrying without it")
            return _openrouter_completion(
                messages=messages, tools=tools, tool_choice=tool_choice,
                temperature=temperature, max_tokens=max_tokens,
            )
        raise


# ---------------------------------------------------------------------------
# Public API — same signatures as before
# ---------------------------------------------------------------------------

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

    # Call with tools (Groq → OpenRouter fallback)
    response = _completion_with_fallback(
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

        # Get next response (with fallback)
        response = _completion_with_fallback(
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
        response = _completion_with_fallback(
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
        # Last-ditch: try without response_format on whichever provider is live
        response = _completion_with_fallback(
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
        response = _completion_with_fallback(
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
        response = _completion_with_fallback(
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

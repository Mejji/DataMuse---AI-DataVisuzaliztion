"""
Test all 8 LLM models across 3 providers for create_chart tool calling.

Sends a prompt to each model individually and checks whether it returns
a valid tool_call with function.name == "create_chart" and a valid
chart_type value from the 19-type enum.
"""

import json
import os
import sys
import time
import traceback

# Force UTF-8 output on Windows
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from groq import Groq
from cerebras.cloud.sdk import Cerebras
from openai import OpenAI as _OpenAI

# Import project settings & tool definitions
sys.path.insert(0, ".")
from app.config import settings, MODEL_POOL
from app.services.data_tools import TOOL_DEFINITIONS

# ── Clients ──────────────────────────────────────────────────────────
groq_client = Groq(api_key=settings.GROQ_API_KEY)
cerebras_client = Cerebras(api_key=settings.CEREBRAS_API_KEY)
gemini_client = _OpenAI(
    api_key=settings.GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

PROVIDER_CLIENTS = {
    "groq": groq_client,
    "cerebras": cerebras_client,
    "gemini": gemini_client,
}

# ── Valid chart types ────────────────────────────────────────────────
VALID_CHART_TYPES = {
    "bar", "line", "pie", "area", "scatter", "composed",
    "treemap", "funnel", "radar", "radialBar",
    "histogram", "groupedBar", "stackedBar", "donut",
    "bubble", "waterfall", "boxPlot", "heatmap", "candlestick",
}

# ── Fake dataset context ────────────────────────────────────────────
SYSTEM_PROMPT = """You are a data analyst assistant. The user has uploaded a CSV dataset.

Dataset columns: Name (string), Age (int), Score (float), Department (string), Date (date), Salary (float)
Sample data:
| Name  | Age | Score | Department | Date       | Salary  |
|-------|-----|-------|------------|------------|---------|
| Alice | 30  | 85.5  | Sales      | 2024-01-15 | 72000   |
| Bob   | 25  | 92.3  | Engineering| 2024-02-20 | 95000   |
| Carol | 35  | 78.1  | Sales      | 2024-03-10 | 68000   |
| Dave  | 28  | 88.7  | Marketing  | 2024-04-05 | 61000   |
| Eve   | 32  | 91.0  | Engineering| 2024-05-12 | 98000   |

When the user asks for a visualization, call the create_chart tool with appropriate parameters.
Do NOT respond with text — ONLY use tool calls."""

TEST_PROMPT = "Show me a histogram of the Score column to see how scores are distributed"

# ── Provider-specific parameters ─────────────────────────────────────
def _build_params(provider: str, model: str):
    """Build chat completion params, handling provider quirks."""
    params = dict(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": TEST_PROMPT},
        ],
        tools=TOOL_DEFINITIONS,
        tool_choice="auto",
        temperature=0.7,
        max_tokens=2048,
    )
    # Cerebras doesn't support tool_choice
    if provider == "cerebras":
        params.pop("tool_choice", None)
    return params


def test_model(provider: str, model: str) -> dict:
    """Test a single model. Returns result dict."""
    client = PROVIDER_CLIENTS[provider]
    result = {
        "provider": provider,
        "model": model,
        "status": "UNKNOWN",
        "tool_call": None,
        "chart_type": None,
        "error": None,
        "latency_s": None,
    }

    try:
        params = _build_params(provider, model)
        t0 = time.time()
        response = client.chat.completions.create(**params)
        result["latency_s"] = round(time.time() - t0, 2)

        message = response.choices[0].message

        # Check for tool calls
        if not message.tool_calls or len(message.tool_calls) == 0:
            result["status"] = "FAIL"
            result["error"] = "No tool_calls returned"
            # Include any text content for debugging
            if message.content:
                result["error"] += f" | Response text: {message.content[:200]}"
            return result

        # Find create_chart call
        chart_call = None
        for tc in message.tool_calls:
            if tc.function.name == "create_chart":
                chart_call = tc
                break

        if not chart_call:
            names = [tc.function.name for tc in message.tool_calls]
            result["status"] = "FAIL"
            result["error"] = f"No create_chart call. Got: {names}"
            return result

        # Parse arguments
        try:
            args = json.loads(chart_call.function.arguments)
        except json.JSONDecodeError as e:
            result["status"] = "FAIL"
            result["error"] = f"Invalid JSON in arguments: {e}"
            return result

        chart_type = args.get("chart_type", "<missing>")
        result["chart_type"] = chart_type
        result["tool_call"] = args

        if chart_type in VALID_CHART_TYPES:
            result["status"] = "PASS"
        else:
            result["status"] = "FAIL"
            result["error"] = f"Invalid chart_type: '{chart_type}'"

    except Exception as e:
        result["status"] = "ERROR"
        result["error"] = f"{type(e).__name__}: {e}"
        result["latency_s"] = None

    return result


def main():
    print("=" * 80)
    print("  DataMuse — Tool Call Test: create_chart across all 8 models")
    print("=" * 80)
    print(f"\nPrompt: \"{TEST_PROMPT}\"")
    print(f"Valid chart types ({len(VALID_CHART_TYPES)}): {sorted(VALID_CHART_TYPES)}")
    print(f"\nTesting {len(MODEL_POOL)} models...\n")

    results = []
    for entry in MODEL_POOL:
        tag = f"[{entry.provider}/{entry.model}]"
        print(f"  Testing {tag} ... ", end="", flush=True)
        r = test_model(entry.provider, entry.model)
        results.append(r)

        if r["status"] == "PASS":
            print(f"✓ PASS  chart_type={r['chart_type']}  ({r['latency_s']}s)")
        elif r["status"] == "FAIL":
            print(f"✗ FAIL  {r['error']}  ({r['latency_s']}s)")
        else:
            print(f"⚠ ERROR  {r['error']}")

    # Summary
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    errors = sum(1 for r in results if r["status"] == "ERROR")

    print(f"\n{'=' * 80}")
    print(f"  RESULTS: {passed} PASS / {failed} FAIL / {errors} ERROR  (out of {len(results)})")
    print(f"{'=' * 80}")

    # Detailed failures
    if failed + errors > 0:
        print("\n  Failed/Error details:")
        for r in results:
            if r["status"] != "PASS":
                print(f"    [{r['provider']}/{r['model']}] {r['status']}: {r['error']}")
                if r.get("tool_call"):
                    print(f"      Tool call args: {json.dumps(r['tool_call'], indent=2)[:300]}")

    # Full tool call dump
    print(f"\n{'─' * 80}")
    print("  Full tool call arguments per model:")
    print(f"{'─' * 80}")
    for r in results:
        print(f"\n  [{r['provider']}/{r['model']}] — {r['status']}")
        if r.get("tool_call"):
            print(f"    {json.dumps(r['tool_call'], indent=2)}")
        elif r.get("error"):
            print(f"    Error: {r['error']}")

    return 0 if (failed + errors) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

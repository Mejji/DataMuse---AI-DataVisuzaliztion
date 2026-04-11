import json
import os
import re
import traceback
import threading
import pandas as pd
from groq import Groq
from cerebras.cloud.sdk import Cerebras
from openai import OpenAI as _OpenAI
from app.config import settings, ModelEntry, classify_complexity
from app.services.muse_prompts import (
    MUSE_SYSTEM_PROMPT,
    VISUALIZATION_SUGGESTION_PROMPT,
    STORY_DRAFT_PROMPT,
)
from app.services.embeddings import embed_text
from app.services.qdrant_service import search, search_aggregates
from app.services.data_tools import TOOL_DEFINITIONS, execute_tool, create_chart_data, create_table_data


# ---------------------------------------------------------------------------
# Fallback chart extraction
#
# Some models ignore function calling and dump chart JSON inline in their
# text response.  This helper scans the text for anything that looks like
# a valid chart config, extracts it, and returns cleaned text + config.
# ---------------------------------------------------------------------------
_CHART_JSON_RE = re.compile(
    r'(\{[^{}]*"chart_type"\s*:\s*"[^"]+?"[^{}]*"data"\s*:\s*\[.*?\]\s*,\s*"config"\s*:\s*\{.*?\}\s*\})',
    re.DOTALL,
)

_CHART_TYPE_VALUES = {
    "bar",
    "line",
    "pie",
    "area",
    "scatter",
    "composed",
    "treemap",
    "funnel",
    "radar",
    "radialBar",
    "histogram",
    "groupedBar",
    "stackedBar",
    "donut",
    "bubble",
    "waterfall",
    "boxPlot",
    "heatmap",
    "candlestick",
}


def _extract_chart_from_text(text: str) -> tuple[str, dict | None]:
    """Try to extract an inline chart JSON from the assistant's text response.

    Returns (cleaned_text, chart_config_or_None).
    """
    if not text:
        return text, None

    # Strategy: find JSON objects that contain the chart config signature
    # Look for { ... "chart_type": ... "data": [...] ... "config": { ... } ... }
    candidates: list[tuple[int, int, dict]] = []

    # Find all positions where "chart_type" appears
    search_start = 0
    while True:
        idx = text.find('"chart_type"', search_start)
        if idx == -1:
            break

        # Walk backwards to find the opening brace
        brace_start = text.rfind('{', 0, idx)
        if brace_start == -1:
            search_start = idx + 1
            continue

        # Try to parse increasingly larger substrings starting from brace_start
        depth = 0
        for i in range(brace_start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    candidate_str = text[brace_start:i + 1]
                    try:
                        obj = json.loads(candidate_str)
                        if (
                            isinstance(obj, dict)
                            and obj.get("chart_type") in _CHART_TYPE_VALUES
                            and isinstance(obj.get("data"), list)
                            and isinstance(obj.get("config"), dict)
                        ):
                            candidates.append((brace_start, i + 1, obj))
                    except (json.JSONDecodeError, ValueError):
                        pass
                    break

        search_start = idx + 1

    if not candidates:
        return text, None

    # Use the largest valid candidate (most complete chart config)
    best = max(candidates, key=lambda c: c[1] - c[0])
    start, end, chart_config = best

    # Remove the JSON from the text
    cleaned = text[:start] + text[end:]
    # Clean up leftover whitespace / empty lines
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()

    print(f"[chart-extractor] Extracted inline chart config from text "
          f"(chart_type={chart_config.get('chart_type')}, "
          f"data_points={len(chart_config.get('data', []))})")

    return cleaned, chart_config

# ---------------------------------------------------------------------------
# Fallback: parse create_chart() pseudo-code from LLM text
#
# Many models output create_chart(...) as Python-style text instead of
# calling the tool.  This parser extracts ALL such calls, executes them
# against the DataFrame, and returns the resulting chart configs.
# ---------------------------------------------------------------------------
def _extract_create_chart_body(text: str) -> list[str]:
    """Extract the full argument body of each create_chart(...) call.

    Uses bracket-depth tracking instead of regex so multi-line calls with
    nested parens (e.g. arithmetic like ``31585 + 6391``) are captured
    correctly.
    """
    bodies: list[str] = []
    search_start = 0
    tag = "create_chart"

    while True:
        idx = text.find(tag, search_start)
        if idx == -1:
            break

        # Find the opening paren
        paren_start = text.find("(", idx + len(tag))
        if paren_start == -1:
            search_start = idx + len(tag)
            continue

        # Walk forward tracking depth
        depth = 0
        for i in range(paren_start, len(text)):
            if text[i] == "(":
                depth += 1
            elif text[i] == ")":
                depth -= 1
                if depth == 0:
                    bodies.append(text[paren_start + 1 : i])
                    search_start = i + 1
                    break
        else:
            # Unbalanced parens — skip
            search_start = idx + len(tag)

    return bodies


def _extract_create_table_body(text: str) -> list[str]:
    """Extract the full argument body of each create_table(...) call.

    Same bracket-depth tracking approach as _extract_create_chart_body.
    """
    bodies: list[str] = []
    search_start = 0
    tag = "create_table"

    while True:
        idx = text.find(tag, search_start)
        if idx == -1:
            break

        paren_start = text.find("(", idx + len(tag))
        if paren_start == -1:
            search_start = idx + len(tag)
            continue

        depth = 0
        for i in range(paren_start, len(text)):
            if text[i] == "(":
                depth += 1
            elif text[i] == ")":
                depth -= 1
                if depth == 0:
                    bodies.append(text[paren_start + 1 : i])
                    search_start = i + 1
                    break
        else:
            search_start = idx + len(tag)

    return bodies


# Alias map for table tool args
_TABLE_ARG_ALIASES: dict[str, str] = {
    "cols": "columns",
    "column": "columns",
    "group": "group_by",
    "groupby": "group_by",
    "agg": "aggregation",
    "aggregate": "aggregation",
    "max_rows": "limit",
    "top": "limit",
    "n": "limit",
    "name": "title",
    "table_title": "title",
    "sort": "sort_by",
    "order": "sort_by",
}


def _parse_create_table_calls(text: str) -> list[dict]:
    """Extract create_table(...) pseudo-code from text and return parsed args."""
    bodies = _extract_create_table_body(text)
    if not bodies:
        return []

    results: list[dict] = []
    for body in bodies:
        args: dict = {}

        kv_re = re.compile(
            r'(\w+)\s*=\s*'
            r'(?:'
            r'"([^"]*?)"'
            r"|'([^']*?)'"
            r'|(\[[^\]]*\])'
            r'|([^,\n]+?)'
            r')'
            r'(?:\s*,|\s*$|\s*\n)',
        )

        for m in kv_re.finditer(body + "\n"):
            key = m.group(1)
            raw_val = (
                m.group(2) if m.group(2) is not None else
                m.group(3) if m.group(3) is not None else
                m.group(4) if m.group(4) is not None else
                m.group(5)
            )
            if raw_val is None:
                continue

            raw_val = raw_val.strip().rstrip(",").rstrip(")")
            key = _TABLE_ARG_ALIASES.get(key, key)

            val: str | list | int | float = raw_val
            if raw_val.startswith("["):
                parsed_list = _safe_eval_list(raw_val)
                if parsed_list is not None:
                    val = parsed_list
            else:
                try:
                    val = int(raw_val)
                except ValueError:
                    try:
                        val = float(raw_val)
                    except ValueError:
                        pass

            args[key] = val

        if args.get("columns") or args.get("group_by") or args.get("title"):
            results.append(args)
            print(f"[table-call-parser] Parsed create_table() call: {list(args.keys())}")

    return results


def _execute_table_calls(
    parsed_calls: list[dict], df: "pd.DataFrame"
) -> list[dict]:
    """Execute parsed create_table() calls against the DataFrame.

    Returns a list of table_config dicts.
    """
    executed: list[dict] = []
    for args in parsed_calls:
        columns_val = args.get("columns")
        if isinstance(columns_val, str):
            columns_val = [columns_val]
        elif not isinstance(columns_val, list):
            columns_val = None

        group_by = args.get("group_by")
        if isinstance(group_by, str) and group_by.lower() in ("none", "null", ""):
            group_by = None

        aggregation = args.get("aggregation")
        if isinstance(aggregation, str) and aggregation.lower() in ("none", "null", ""):
            aggregation = None

        limit = args.get("limit", 50)
        if isinstance(limit, str):
            try:
                limit = int(limit)
            except ValueError:
                limit = 50

        title = str(args.get("title", "Data Table"))
        sort_by = args.get("sort_by")
        if isinstance(sort_by, str) and sort_by.lower() in ("none", "null", ""):
            sort_by = None

        try:
            table_config = create_table_data(
                df,
                columns=columns_val,
                group_by=group_by if isinstance(group_by, str) else None,
                aggregation=aggregation if isinstance(aggregation, str) else "sum",
                title=title,
                sort_by=sort_by if isinstance(sort_by, str) else None,
                limit=limit,
            )
            if "error" in table_config:
                print(f"[table-call-parser] Error: {table_config['error']}")
                continue
            executed.append(table_config)
        except Exception as e:
            print(f"[table-call-parser] Exception for '{title}': {e}")
            continue

    return executed
_ARG_ALIASES: dict[str, str] = {
    "type": "chart_type",
    "chart": "chart_type",
    "x": "x_column",
    "x_axis": "x_column",
    "x_col": "x_column",
    "y": "y_columns",
    "y_axis": "y_columns",
    "y_col": "y_columns",
    "y_column": "y_columns",
    "label": "labels",
    "agg": "aggregation",
    "aggregate": "aggregation",
    "group": "group_by",
    "groupby": "group_by",
    "max_rows": "limit",
    "top": "limit",
    "n": "limit",
    "name": "title",
    "chart_title": "title",
}


def _safe_eval_list(raw: str) -> list | None:
    """Safely evaluate a Python-style list literal with arithmetic.

    Handles: ["a", "b"], [1 + 2, 3 + 4], [1183 + 183 + 9 + 9 + 9 + 1], etc.
    Returns None if parsing fails.
    """
    raw = raw.strip()
    if not raw.startswith("[") or not raw.endswith("]"):
        return None
    inner = raw[1:-1].strip()
    if not inner:
        return []

    # Split on commas that are NOT inside quotes or nested brackets
    items: list[str] = []
    current = ""
    depth = 0
    in_str: str | None = None
    for ch in inner:
        if in_str:
            current += ch
            if ch == in_str:
                in_str = None
            continue
        if ch in ('"', "'"):
            in_str = ch
            current += ch
        elif ch == "[":
            depth += 1
            current += ch
        elif ch == "]":
            depth -= 1
            current += ch
        elif ch == "," and depth == 0:
            items.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        items.append(current.strip())

    result: list = []
    for item in items:
        item = item.strip()
        # Quoted string
        if (item.startswith('"') and item.endswith('"')) or \
           (item.startswith("'") and item.endswith("'")):
            result.append(item[1:-1])
        else:
            # Try arithmetic evaluation (safe: only +, -, *, /, digits, spaces)
            if re.fullmatch(r'[\d\s\+\-\*\/\.\(\)]+', item):
                try:
                    result.append(eval(item))  # noqa: S307 — safe: digits+ops only
                except Exception:
                    result.append(item)
            else:
                # Bare string (unquoted column name, etc.)
                result.append(item)
    return result


def _parse_create_chart_calls(text: str) -> list[dict]:
    """Extract create_chart(...) pseudo-code from text and return parsed args.

    Handles both Python keyword-arg style:
        create_chart(chart_type="bar", x_column="col", ...)
    and informal/aliased styles:
        create_chart(type="bar", x=["a","b"], y=[10, 20], ...)

    Returns a list of argument dicts suitable for create_chart_data() or
    direct chart building.
    """
    bodies = _extract_create_chart_body(text)
    if not bodies:
        return []

    results: list[dict] = []
    for body in bodies:
        args: dict = {}

        # Parse key=value patterns (value can be quoted string, list, or bare)
        # Use a bracket-aware approach for list values
        kv_re = re.compile(
            r'(\w+)\s*=\s*'
            r'(?:'
            r'"([^"]*?)"'          # group 2: double-quoted string
            r"|'([^']*?)'"          # group 3: single-quoted string
            r'|(\[[^\]]*\])'        # group 4: simple list (no nested brackets)
            r'|([^,\n]+?)'          # group 5: bare value (up to comma/newline)
            r')'
            r'(?:\s*,|\s*$|\s*\n)',
        )

        for m in kv_re.finditer(body + "\n"):
            key = m.group(1)
            raw_val = (
                m.group(2) if m.group(2) is not None else
                m.group(3) if m.group(3) is not None else
                m.group(4) if m.group(4) is not None else
                m.group(5)
            )
            if raw_val is None:
                continue

            raw_val = raw_val.strip().rstrip(",").rstrip(")")

            # Normalize key via alias map
            key = _ARG_ALIASES.get(key, key)

            # Try to parse lists (handles arithmetic inside)
            val: str | list | int | float = raw_val
            if raw_val.startswith("["):
                parsed_list = _safe_eval_list(raw_val)
                if parsed_list is not None:
                    val = parsed_list
            else:
                try:
                    val = int(raw_val)
                except ValueError:
                    try:
                        val = float(raw_val)
                    except ValueError:
                        pass

            args[key] = val

        # Accept if we have any chart-related key
        if (args.get("chart_type") or args.get("x_column") or
                args.get("x_data") or args.get("y_columns") or
                args.get("title")):
            results.append(args)

    return results


def _execute_chart_calls(
    parsed_calls: list[dict], df: pd.DataFrame
) -> list[dict]:
    """Execute parsed create_chart args against the DataFrame.

    Handles two modes:
    1. Column-reference mode: x_column="col_name", y_columns=["col_name"]
       → calls create_chart_data() to query the DataFrame
    2. Pre-baked mode: x_column=["Completed","Not Completed"], y_columns=[37976, 1394]
       → the LLM already computed the data; build chart config directly

    Returns a list of {title, description, chart_config} dicts.
    """
    executed: list[dict] = []
    for args in parsed_calls:
        chart_type = str(args.get("chart_type", "bar"))
        title = str(args.get("title", ""))

        x_val = args.get("x_column", "")
        y_val = args.get("y_columns")
        labels = args.get("labels")

        # ---- Pre-baked mode: x and y are both lists of literal values ----
        if isinstance(x_val, list) and isinstance(y_val, list):
            # Use canonical keys to prevent case mismatches between
            # LLM-chosen labels and Recharts dataKey references.
            x_key = "category"
            y_key = "value"

            # Preserve original labels for title/description only
            x_label = "Category"
            y_label = "Value"
            if isinstance(labels, list):
                if len(labels) >= 1:
                    x_label = str(labels[0])
                if len(labels) >= 2:
                    y_label = str(labels[1])

            data = []
            for i, x_item in enumerate(x_val):
                y_item = y_val[i] if i < len(y_val) else 0
                # Ensure y values are numeric
                if isinstance(y_item, str):
                    try:
                        y_item = float(y_item.replace(",", ""))
                    except (ValueError, AttributeError):
                        y_item = 0
                data.append({x_key: str(x_item), y_key: y_item})

            # Pick a color
            colors = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"]

            chart_config = {
                "chart_type": chart_type,
                "title": title or f"{y_label} by {x_label}",
                "data": data,
                "config": {
                    "xAxisKey": x_key,
                    "series": [{"dataKey": y_key, "color": colors[0]}],
                },
            }

            executed.append({
                "title": title or chart_config.get("title", "Chart"),
                "description": f"{chart_type.title()} chart",
                "chart_config": chart_config,
            })
            print(f"[chart-call-parser] Built pre-baked chart: '{title}' "
                  f"({len(data)} data points)")
            continue

        # ---- Column-reference mode: standard tool-call style ----
        x_column = str(x_val) if x_val else ""

        # y_columns can come as y_column (singular) or y_columns (list)
        y_columns = y_val
        if isinstance(y_columns, str):
            y_columns = [y_columns]
        elif not isinstance(y_columns, list):
            y_columns = None

        # Handle special y_column="count" — means aggregation=count
        aggregation = str(args.get("aggregation", "sum"))
        if y_columns and len(y_columns) == 1 and y_columns[0].lower() == "count":
            aggregation = "count"
            # For count aggregation, we need a real numeric column or just use x_column
            # create_chart_data with group_by handles count
            y_columns = None  # Will be handled by count aggregation

        group_by = args.get("group_by")
        if isinstance(group_by, str) and group_by.lower() in ("none", "null", ""):
            group_by = None

        limit = args.get("limit", 20)
        if isinstance(limit, str):
            try:
                limit = int(limit)
            except ValueError:
                limit = 20

        if not x_column:
            continue

        # For count aggregation without y_columns, use the x_column as group_by
        # and pick any numeric column for y
        if aggregation == "count" and not y_columns:
            group_by = x_column
            # Find first numeric column for the groupby result
            numeric_cols = df.select_dtypes(include="number").columns.tolist()
            if numeric_cols:
                y_columns = [numeric_cols[0]]
            else:
                y_columns = [x_column]

        if not y_columns:
            # Try to pick a reasonable numeric column
            numeric_cols = df.select_dtypes(include="number").columns.tolist()
            numeric_cols = [c for c in numeric_cols if c != x_column]
            if numeric_cols:
                y_columns = [numeric_cols[0]]
            else:
                continue

        try:
            chart_config = create_chart_data(
                df,
                chart_type=chart_type,
                x_column=x_column,
                y_columns=y_columns,
                group_by=group_by if isinstance(group_by, str) else None,
                aggregation=aggregation,
                limit=limit,
            )
            if "error" in chart_config:
                print(f"[chart-call-parser] Error for '{title}': {chart_config['error']}")
                continue

            if title:
                chart_config["title"] = title

            executed.append({
                "title": title or chart_config.get("title", "Chart"),
                "description": f"{chart_type.title()} chart of {x_column}",
                "chart_config": chart_config,
            })
        except Exception as e:
            print(f"[chart-call-parser] Exception for '{title}': {e}")
            continue

    return executed


# ---------------------------------------------------------------------------
# Deterministic chart fallback
#
# When the LLM ignores create_chart and outputs a text description instead,
# this layer detects visualization intent in the user message, infers
# reasonable chart parameters from the dataset profile, and calls
# create_chart_data() directly — guaranteeing a chart regardless of model.
# ---------------------------------------------------------------------------

_VIZ_INTENT_PATTERNS = re.compile(
    r'\b('
    r'show\s+(?:me\s+)?(?:a\s+|the\s+)?(?:chart|graph|plot|visual|visualization|diagram|bar|line|pie|area|scatter|histogram|distribution|trend|comparison)'
    r'|(?:create|make|generate|build|draw|render|display|give\s+me)\s+(?:a\s+|the\s+)?(?:chart|graph|plot|visual|visualization|diagram)'
    r'|visuali[sz]e'
    r'|(?:chart|graph|plot)\s+(?:of|for|showing|comparing|with)'
    r'|(?:pie|bar|line|area|scatter)\s+chart'
    r'|(?:can\s+(?:you|i)\s+see|let\s+me\s+see|i\s+(?:want|need)\s+to\s+see)\b.*\b(?:chart|graph|plot|visual|data|breakdown|comparison)'
    r')\b',
    re.IGNORECASE,
)

_RECOMMEND_INTENT_RE = re.compile(
    r'\b('
    r'recommend(?:ed)?\s+(?:visuali[sz]ation|chart|graph|plot)s?'
    r'|suggest(?:ed)?\s+(?:visuali[sz]ation|chart|graph|plot)s?'
    r'|what\s+(?:chart|visuali[sz]ation|graph|plot)s?\s+(?:should|can|do\s+you)'
    r'|(?:show|give)\s+(?:me\s+)?recommend'
    r')\b',
    re.IGNORECASE,
)


def _has_viz_intent(user_message: str) -> bool:
    """Return True if the user message requests a visualization."""
    return bool(_VIZ_INTENT_PATTERNS.search(user_message))


def _has_recommendation_intent(user_message: str) -> bool:
    """Return True if the user is asking for recommended/suggested visualizations."""
    return bool(_RECOMMEND_INTENT_RE.search(user_message))


# ---------------------------------------------------------------------------
# Table intent detection
# ---------------------------------------------------------------------------
_TABLE_INTENT_RE = re.compile(
    r'\b('
    r'(?:create|make|generate|build|show|give\s+me|display)\s+(?:a\s+|the\s+)?(?:table|tabular|spreadsheet|data\s+table)'
    r'|(?:show|list|display)\s+(?:me\s+)?(?:the\s+|all\s+)?(?:data|rows|records|entries|values)\s*(?:in\s+(?:a\s+)?table)?'
    r'|(?:table|tabular)\s+(?:of|for|showing|comparing|with|view|format)'
    r'|(?:put|format|arrange|organize)\s+.*\b(?:table|tabular|rows\s+and\s+columns)'
    r'|(?:rows\s+and\s+columns|tabular\s+(?:view|format|data|display))'
    r')\b',
    re.IGNORECASE,
)


def _has_table_intent(user_message: str) -> bool:
    """Return True if the user message requests a table."""
    # Only match if there's no viz intent (prefer chart over table when both
    # could match, e.g. "show me data" alone is ambiguous).
    if _has_viz_intent(user_message):
        return False
    return bool(_TABLE_INTENT_RE.search(user_message))


def _build_fallback_table(
    user_message: str,
    llm_response_text: str,
    profile: dict,
    df: "pd.DataFrame",
) -> dict | None:
    """Build a table deterministically when the LLM failed to call create_table.

    Returns a table_config dict, or None if we can't produce one.
    """
    if df is None or df.empty:
        return None

    columns = profile.get("columns", [])
    msg_lower = user_message.lower()

    # Pick columns mentioned by the user, or default to all columns
    mentioned_cols: list[str] = []
    for c in columns:
        name = c.get("name", "") if isinstance(c, dict) else getattr(c, "name", "")
        if name.lower() in msg_lower or name.lower().replace("_", " ") in msg_lower:
            mentioned_cols.append(name)

    selected_columns = mentioned_cols if mentioned_cols else None

    # Detect group_by / aggregation from the message
    group_by: str | None = None
    aggregation: str | None = None

    if any(kw in msg_lower for kw in ["by ", "per ", "grouped by", "group by", "for each"]):
        # Try to find a categorical column mentioned near "by"
        for c in columns:
            name = c.get("name", "") if isinstance(c, dict) else getattr(c, "name", "")
            dtype = c.get("dtype", "") if isinstance(c, dict) else getattr(c, "dtype", "")
            if not any(kw in dtype.lower() for kw in ["int", "float", "number"]):
                if name.lower() in msg_lower:
                    group_by = name
                    break

    if any(kw in msg_lower for kw in ["average", "avg", "mean"]):
        aggregation = "mean"
    elif any(kw in msg_lower for kw in ["total", "sum"]):
        aggregation = "sum"
    elif any(kw in msg_lower for kw in ["count", "how many", "number of"]):
        aggregation = "count"

    # Build title from user message
    title = "Data Table"
    if group_by and aggregation:
        title = f"{aggregation.title()} by {group_by.replace('_', ' ').title()}"

    print(
        f"[fallback-table] Building deterministic table: "
        f"columns={selected_columns}, group_by={group_by}, agg={aggregation}"
    )

    try:
        table_config = create_table_data(
            df,
            columns=selected_columns,
            group_by=group_by,
            aggregation=aggregation or "sum",
            title=title,
            limit=50,
        )
        if "error" in table_config:
            print(f"[fallback-table] create_table_data error: {table_config['error']}")
            return None
        return table_config
    except Exception as e:
        print(f"[fallback-table] Exception: {e}")
        return None


def _infer_chart_type(profile: dict, x_col: str, y_cols: list[str],
                      user_message: str) -> str:
    """Pick the best chart type based on column types and user keywords."""
    msg_lower = user_message.lower()

    # Explicit chart type mentioned by user
    for chart_kw, chart_type in [
        ("pie", "pie"), ("scatter", "scatter"), ("line", "line"),
        ("area", "area"), ("bar", "bar"),
    ]:
        if chart_kw in msg_lower:
            return chart_type

    for chart_kw, chart_type in [
        ("histogram", "histogram"),
        ("grouped bar", "groupedBar"),
        ("side by side bar", "groupedBar"),
        ("stacked bar", "stackedBar"),
        ("stacked", "stackedBar"),
        ("donut", "donut"),
        ("doughnut", "donut"),
        ("bubble", "bubble"),
        ("waterfall", "waterfall"),
        ("bridge chart", "waterfall"),
        ("box plot", "boxPlot"),
        ("boxplot", "boxPlot"),
        ("quartile", "boxPlot"),
        ("heatmap", "heatmap"),
        ("heat map", "heatmap"),
        ("correlation matrix", "heatmap"),
        ("candlestick", "candlestick"),
        ("ohlc", "candlestick"),
        ("stock chart", "candlestick"),
        ("treemap", "treemap"),
        ("tree map", "treemap"),
        ("hierarchy", "treemap"),
        ("proportion", "treemap"),
        ("funnel", "funnel"),
        ("conversion", "funnel"),
        ("pipeline", "funnel"),
        ("stages", "funnel"),
        ("radar", "radar"),
        ("spider", "radar"),
        ("multi-dimensional", "radar"),
        ("comparison radar", "radar"),
        ("radial", "radialBar"),
        ("gauge", "radialBar"),
        ("progress", "radialBar"),
    ]:
        if chart_kw in msg_lower:
            return chart_type

    # Look up x-column dtype from profile
    x_dtype = ""
    for col_info in profile.get("columns", []):
        name = col_info.get("name", "") if isinstance(col_info, dict) else getattr(col_info, "name", "")
        if name == x_col:
            x_dtype = col_info.get("dtype", "") if isinstance(col_info, dict) else getattr(col_info, "dtype", "")
            break

    # Date/time x-axis → line chart
    if any(kw in x_dtype.lower() for kw in ["date", "time"]):
        return "line"
    if any(kw in x_col.lower() for kw in ["date", "time", "year", "month", "week", "day"]):
        return "line"

    # "trend" keyword → line chart
    if "trend" in msg_lower:
        return "line"

    # "distribution" keyword → histogram
    if "distribution" in msg_lower:
        return "histogram"

    # 3+ numeric columns + comparison/profiling language → radar
    numeric_cols_count = 0
    x_unique_count: int | None = None
    x_name_lower = x_col.lower()
    for col_info in profile.get("columns", []):
        name = col_info.get("name", "") if isinstance(col_info, dict) else getattr(col_info, "name", "")
        dtype = col_info.get("dtype", "") if isinstance(col_info, dict) else getattr(col_info, "dtype", "")
        unique_count = col_info.get("unique_count", None) if isinstance(col_info, dict) else getattr(col_info, "unique_count", None)
        if any(kw in str(dtype).lower() for kw in ["int", "float", "number"]):
            numeric_cols_count += 1
        if name == x_col and isinstance(unique_count, int):
            x_unique_count = unique_count

    if (
        numeric_cols_count >= 3
        and any(kw in msg_lower for kw in ["compare", "comparison", "profile", "profiling", "benchmark"])
    ):
        return "radar"

    # Few categories + single metric can be represented well as treemap
    if len(y_cols) == 1 and x_unique_count is not None and x_unique_count <= 8:
        if any(kw in msg_lower for kw in ["breakdown", "share", "proportion", "composition", "category"]):
            return "treemap"

    # Sequential stage-like data tends to work well in funnels
    if (
        any(kw in msg_lower for kw in ["funnel", "conversion", "pipeline", "stage", "stages", "journey"])
        or any(kw in x_name_lower for kw in ["stage", "step", "status", "pipeline", "funnel", "journey"])
    ):
        return "funnel"

    # Default: bar chart — safest for categorical data
    return "bar"


def _pick_columns_from_profile(
    profile: dict, user_message: str
) -> tuple[str, list[str], str | None, str]:
    """Heuristically pick x_column, y_columns, group_by, and aggregation
    from the dataset profile and user message.

    Returns (x_column, y_columns, group_by, aggregation).
    """
    columns = profile.get("columns", [])
    msg_lower = user_message.lower()

    numeric_cols: list[dict] = []
    categorical_cols: list[dict] = []
    date_cols: list[dict] = []

    for c in columns:
        # Support both dict and Pydantic model
        name = c.get("name", "") if isinstance(c, dict) else getattr(c, "name", "")
        dtype = c.get("dtype", "") if isinstance(c, dict) else getattr(c, "dtype", "")
        unique = c.get("unique_count", 0) if isinstance(c, dict) else getattr(c, "unique_count", 0)
        col_info = {"name": name, "dtype": dtype, "unique_count": unique}

        if any(kw in dtype.lower() for kw in ["date", "time"]):
            date_cols.append(col_info)
        elif any(kw in dtype.lower() for kw in ["int", "float", "number"]):
            numeric_cols.append(col_info)
        else:
            categorical_cols.append(col_info)

    # Also classify by column name heuristics
    for c in columns:
        name = c.get("name", "") if isinstance(c, dict) else getattr(c, "name", "")
        dtype = c.get("dtype", "") if isinstance(c, dict) else getattr(c, "dtype", "")
        if name.lower() in ("date", "time", "timestamp", "created_at", "updated_at",
                            "year", "month", "week", "day", "period"):
            if not any(d["name"] == name for d in date_cols):
                date_cols.append({"name": name, "dtype": dtype, "unique_count": 0})

    # Try to match column names mentioned in the user message
    mentioned_numeric: list[str] = []
    mentioned_categorical: list[str] = []
    mentioned_date: list[str] = []
    for c in columns:
        name = c.get("name", "") if isinstance(c, dict) else getattr(c, "name", "")
        if name.lower() in msg_lower or name.lower().replace("_", " ") in msg_lower:
            if any(d["name"] == name for d in date_cols):
                mentioned_date.append(name)
            elif any(n["name"] == name for n in numeric_cols):
                mentioned_numeric.append(name)
            elif any(cat["name"] == name for cat in categorical_cols):
                mentioned_categorical.append(name)

    # --- Decision logic ---
    x_column = ""
    y_columns: list[str] = []
    group_by: str | None = None
    aggregation = "sum"

    # Prefer user-mentioned columns
    if mentioned_date:
        x_column = mentioned_date[0]
    elif mentioned_categorical:
        x_column = mentioned_categorical[0]

    if mentioned_numeric:
        y_columns = mentioned_numeric[:3]  # max 3 series

    # Fallback: auto-pick from profile
    if not x_column:
        if date_cols:
            x_column = date_cols[0]["name"]
        elif categorical_cols:
            # Pick categorical with reasonable cardinality (not an ID column)
            good_cats = [c for c in categorical_cols if 2 <= c["unique_count"] <= 50]
            if good_cats:
                x_column = good_cats[0]["name"]
            elif categorical_cols:
                x_column = categorical_cols[0]["name"]

    if not y_columns:
        # Pick first numeric column(s) that aren't likely IDs
        for n in numeric_cols:
            name = n["name"]
            if name.lower() not in ("id", "index", "row", "row_number"):
                y_columns.append(name)
                if len(y_columns) >= 2:
                    break

    # If x_column is categorical and different from group_by, set group_by
    if x_column and any(c["name"] == x_column for c in categorical_cols):
        group_by = x_column

    # Aggregation heuristics from user message
    if any(kw in msg_lower for kw in ["average", "avg", "mean"]):
        aggregation = "mean"
    elif any(kw in msg_lower for kw in ["count", "how many", "number of", "frequency"]):
        aggregation = "count"
    elif any(kw in msg_lower for kw in ["max", "maximum", "highest", "top", "best"]):
        aggregation = "max"
    elif any(kw in msg_lower for kw in ["min", "minimum", "lowest", "bottom", "worst"]):
        aggregation = "min"

    # Last-resort defaults
    if not x_column and columns:
        name = columns[0].get("name", "") if isinstance(columns[0], dict) else getattr(columns[0], "name", "")
        x_column = name
    if not y_columns and numeric_cols:
        y_columns = [numeric_cols[0]["name"]]

    return x_column, y_columns, group_by, aggregation


def _build_fallback_chart(
    user_message: str,
    llm_response_text: str,
    profile: dict,
    df: pd.DataFrame,
) -> dict | None:
    """Build a chart deterministically when the LLM failed to call create_chart.

    Returns a chart_config dict, or None if we can't produce one.
    """
    if df is None or df.empty:
        return None

    x_column, y_columns, group_by, aggregation = _pick_columns_from_profile(
        profile, user_message
    )

    if not x_column or not y_columns:
        print("[fallback-chart] Could not determine x/y columns from profile")
        return None

    chart_type = _infer_chart_type(profile, x_column, y_columns, user_message)

    print(
        f"[fallback-chart] Building deterministic chart: "
        f"type={chart_type}, x={x_column}, y={y_columns}, "
        f"group_by={group_by}, agg={aggregation}"
    )

    try:
        chart_config = create_chart_data(
            df,
            chart_type=chart_type,
            x_column=x_column,
            y_columns=y_columns,
            group_by=group_by,
            aggregation=aggregation,
            limit=20,
        )
        if "error" in chart_config:
            print(f"[fallback-chart] create_chart_data error: {chart_config['error']}")
            return None
        return chart_config
    except Exception as e:
        print(f"[fallback-chart] Exception: {e}")
        return None


# ---------------------------------------------------------------------------
# Provider clients (initialized lazily / eagerly as needed)
# ---------------------------------------------------------------------------
groq_client = Groq(api_key=settings.GROQ_API_KEY)
cerebras_client = Cerebras(api_key=settings.CEREBRAS_API_KEY)
gemini_client = _OpenAI(
    api_key=settings.GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)


# ---------------------------------------------------------------------------
# Model Load Balancer (multi-provider, tier-aware)
#
# Groq, Cerebras, and Gemini models each have independent rate limits.
# Models are organized into tiers (1=strong, 2=mid, 3=fast).  The router
# picks from the requested tier first, then escalates to stronger tiers
# if the requested tier is exhausted.
#
# On a 429 (rate limit), we mark that model exhausted and skip to the next.
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_current_tier_index: dict[int, int] = {1: 0, 2: 0, 3: 0}  # per-tier round-robin
_exhausted_models: dict[str, float] = {}  # "provider:model" -> timestamp
_EXHAUSTION_TTL = 60.0  # seconds before a rate-limited model is retried

# Tier pinning: keep the same tier for a conversation (keyed by dataset_id)
# so multi-turn chats maintain consistent quality level.
_pinned_tiers: dict[str, int] = {}  # dataset_id -> tier number
# Also keep model pinning within the tier for conversation coherence
_pinned_models: dict[str, ModelEntry] = {}  # dataset_id -> ModelEntry

import time as _time


def _model_key(entry: ModelEntry) -> str:
    """Unique string key for exhaustion tracking."""
    return f"{entry.provider}:{entry.model}"


def _get_tier_pool(tier: int) -> list[ModelEntry]:
    """Return models belonging to a specific tier."""
    return [m for m in settings.MODEL_POOL if m.tier == tier]


def _get_next_model(tier: int = 2) -> ModelEntry | None:
    """Return the next available model for the given tier via round-robin.

    If no models are available in the requested tier, escalates:
      tier 3 → try tier 2 → try tier 1
      tier 2 → try tier 1
      tier 1 → no escalation (already strongest)

    Returns None if ALL models across all eligible tiers are exhausted.
    """
    global _current_tier_index
    now = _time.monotonic()

    # Build escalation path: requested tier first, then stronger tiers
    if tier == 3:
        tier_order = [3, 2, 1]
    elif tier == 2:
        tier_order = [2, 1]
    else:
        tier_order = [1]

    with _lock:
        # Expire stale exhaustions
        expired = [m for m, t in _exhausted_models.items() if now - t >= _EXHAUSTION_TTL]
        for m in expired:
            del _exhausted_models[m]
            print(f"[load-balancer] Model '{m}' cooldown expired — available again")

        for try_tier in tier_order:
            pool = _get_tier_pool(try_tier)
            pool_size = len(pool)
            if pool_size == 0:
                continue

            start_idx = _current_tier_index.get(try_tier, 0)
            for i in range(pool_size):
                idx = (start_idx + i) % pool_size
                entry = pool[idx]
                if _model_key(entry) not in _exhausted_models:
                    _current_tier_index[try_tier] = (idx + 1) % pool_size
                    if try_tier != tier:
                        print(f"[load-balancer] Tier {tier} exhausted — escalated to tier {try_tier}")
                    return entry

    return None  # all models exhausted


def _mark_exhausted(entry: ModelEntry) -> None:
    """Mark a model as rate-limited. It will auto-recover after _EXHAUSTION_TTL."""
    key = _model_key(entry)
    with _lock:
        _exhausted_models[key] = _time.monotonic()
    tier_pool = _get_tier_pool(entry.tier)
    exhausted_in_tier = sum(
        1 for m in tier_pool if _model_key(m) in _exhausted_models
    )
    print(f"[load-balancer] Model '{key}' (tier {entry.tier}) rate-limited "
          f"(cooldown={_EXHAUSTION_TTL}s). "
          f"Tier {entry.tier}: {exhausted_in_tier}/{len(tier_pool)} exhausted, "
          f"Total: {len(_exhausted_models)}/{len(settings.MODEL_POOL)}")


def _pin_model(dataset_id: str, entry: ModelEntry) -> None:
    """Pin a model and its tier to a dataset conversation for consistency."""
    _pinned_models[dataset_id] = entry
    _pinned_tiers[dataset_id] = entry.tier
    print(f"[load-balancer] Pinned model '{entry.provider}:{entry.model}' "
          f"(tier {entry.tier}) to dataset '{dataset_id}'")


def _get_pinned_model(dataset_id: str) -> ModelEntry | None:
    """Get the pinned model for a dataset, if it exists and isn't exhausted."""
    entry = _pinned_models.get(dataset_id)
    if entry is None:
        return None
    # Check if pinned model is currently exhausted
    key = _model_key(entry)
    with _lock:
        now = _time.monotonic()
        ts = _exhausted_models.get(key)
        if ts is not None and now - ts < _EXHAUSTION_TTL:
            print(f"[load-balancer] Pinned model '{key}' is rate-limited — "
                  f"falling back to tier {entry.tier} round-robin")
            return None
    return entry


def _get_pinned_tier(dataset_id: str) -> int | None:
    """Get the pinned tier for a dataset conversation."""
    return _pinned_tiers.get(dataset_id)


def _upgrade_tier_pin(dataset_id: str, new_tier: int) -> None:
    """Upgrade (lower number = stronger) a conversation's tier pin if needed.

    Only upgrades — never downgrades an active conversation to a weaker tier.
    """
    current = _pinned_tiers.get(dataset_id)
    if current is None or new_tier < current:
        _pinned_tiers[dataset_id] = new_tier
        # Clear model pin so next request picks from the new tier
        _pinned_models.pop(dataset_id, None)
        print(f"[load-balancer] Upgraded dataset '{dataset_id}' tier pin: "
              f"{current} → {new_tier}")


def _is_request_too_large(exc: Exception) -> bool:
    """Return True if the exception indicates the request exceeded TPM / size limits.

    This is different from a daily rate limit — the model is fine, the *request*
    is too big.  We should retry with trimmed context, not exhaust the model.
    """
    msg = str(exc).lower()
    return ("413" in msg or "request too large" in msg
            or "tokens per minute" in msg or "reduce your message" in msg)


def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True if the exception indicates a daily / RPD rate-limit (429).

    TPM / request-too-large errors are handled separately by
    ``_is_request_too_large``.
    """
    if _is_request_too_large(exc):
        return False
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


def _trim_messages_for_tpm(messages: list[dict]) -> list[dict]:
    """Reduce message payload size for models with tight TPM limits.

    Strategy (applied in order until small enough):
    1. Halve the RAG context in the last user message
    2. Drop conversation history (keep only system + last user)
    3. Truncate the system prompt (remove ANALYTICAL_KNOWLEDGE / DATA_AGENT_KNOWLEDGE)
    """
    import copy
    msgs = copy.deepcopy(messages)

    # 1. Trim RAG context in the last user message (the enriched one)
    for i in range(len(msgs) - 1, -1, -1):
        if msgs[i]["role"] == "user":
            content = msgs[i]["content"]
            # Truncate the "Dataset context" section to ~500 chars
            ctx_marker = "Dataset context (from vector search):"
            col_marker = "Dataset columns:"
            if ctx_marker in content and col_marker in content:
                ctx_start = content.index(ctx_marker)
                col_start = content.index(col_marker)
                trimmed_ctx = content[ctx_start:ctx_start + 500]
                msgs[i]["content"] = (
                    content[:ctx_start] + trimmed_ctx + "\n\n" + content[col_start:]
                )
                print(f"[tpm-trim] Trimmed RAG context from {len(content)} to {len(msgs[i]['content'])} chars")
            break

    # 2. Drop conversation history — keep only system + last user
    if len(msgs) > 2:
        system_msg = msgs[0] if msgs[0]["role"] == "system" else None
        last_user = None
        for m in reversed(msgs):
            if m["role"] == "user":
                last_user = m
                break
        if system_msg and last_user:
            msgs = [system_msg, last_user]
            print("[tpm-trim] Dropped conversation history")

    return msgs


# ---------------------------------------------------------------------------
# Per-provider completion functions
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


def _cerebras_completion(*, model: str, messages: list, tools=None,
                         tool_choice=None, temperature: float = 0.7,
                         max_tokens: int = 2048, response_format=None):
    """Call Cerebras with a specific model. Raises on error."""
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
    return cerebras_client.chat.completions.create(**kwargs)


def _gemini_completion(*, model: str, messages: list, tools=None,
                       tool_choice=None, temperature: float = 0.7,
                       max_tokens: int = 2048, response_format=None):
    """Call Gemini via OpenAI-compatible endpoint. Raises on error."""
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
    return gemini_client.chat.completions.create(**kwargs)


# Provider → completion function dispatch
_PROVIDER_FN = {
    "groq": _groq_completion,
    "cerebras": _cerebras_completion,
    "gemini": _gemini_completion,
}


def _dispatch_completion(entry: ModelEntry, **kwargs):
    """Route a completion call to the correct provider client."""
    fn = _PROVIDER_FN.get(entry.provider)
    if fn is None:
        raise ValueError(f"Unknown provider: {entry.provider}")
    return fn(model=entry.model, **kwargs)


def _completion_with_failover(*, messages: list, tools=None,
                               tool_choice=None, temperature: float = 0.7,
                               max_tokens: int = 2048, response_format=None,
                               label: str = "", preferred_model: ModelEntry | None = None,
                               tier: int = 2):
    """Try models from the requested tier. On 429, failover to next model.

    If *preferred_model* is set, try it first (for conversation pinning).
    *tier* controls which pool to draw from (1=strong, 2=mid, 3=fast).
    Models escalate to stronger tiers if the requested tier is exhausted.
    Returns ``(response, model_entry_used)`` tuple.

    Also handles Groq quirks: tool_use_failed retries on next model,
    response_format ConnectionError retries without response_format,
    and 413 request-too-large retries with trimmed context.
    """
    attempts = 0
    last_error: Exception | None = None

    # Build ordered list: preferred model first (if set), then tier-aware round-robin
    def _next_entry() -> ModelEntry | None:
        nonlocal preferred_model
        if preferred_model is not None:
            m = preferred_model
            preferred_model = None  # only try once
            return m
        return _get_next_model(tier=tier)

    pool_size = len(settings.MODEL_POOL)
    max_attempts = pool_size + (1 if preferred_model else 0)

    while attempts < max_attempts:
        entry = _next_entry()
        if entry is None:
            break  # all models exhausted

        attempts += 1
        print(f"[{label}] Using model: {entry.provider}:{entry.model}")

        try:
            result = _dispatch_completion(
                entry, messages=messages, tools=tools,
                tool_choice=tool_choice, temperature=temperature,
                max_tokens=max_tokens, response_format=response_format,
            )
            return result, entry
        except Exception as e:
            last_error = e

            if _is_rate_limit_error(e):
                _mark_exhausted(entry)
                continue  # try next model

            # Request too large (413 / TPM) — trim context and retry same model
            if _is_request_too_large(e):
                print(f"[{label}] Request too large on {entry.provider}:{entry.model} — trimming context")
                trimmed = _trim_messages_for_tpm(messages)
                try:
                    result = _dispatch_completion(
                        entry, messages=trimmed, tools=tools,
                        tool_choice=tool_choice, temperature=temperature,
                        max_tokens=max_tokens, response_format=response_format,
                    )
                    return result, entry
                except Exception as e2:
                    # If still too large after trimming, try without tools
                    if _is_request_too_large(e2) and tools:
                        print(f"[{label}] Still too large — retrying without tools")
                        try:
                            result = _dispatch_completion(
                                entry, messages=trimmed,
                                temperature=temperature, max_tokens=max_tokens,
                            )
                            return result, entry
                        except Exception:
                            pass
                    if _is_rate_limit_error(e2):
                        _mark_exhausted(entry)
                        continue
                    # Fall through to try next model
                    continue

            # tool_use_failed — model generated bad tool syntax.
            # Try next model first (might succeed with proper tool calls).
            if ("tool_use_failed" in str(e) or "tool" in str(e).lower()) and tools:
                print(f"[{label}] tool_use_failed on {entry.provider}:{entry.model} — trying next model")
                continue  # try next model with tools intact

            # response_format ConnectionError — retry without it
            if response_format and "ConnectionError" in type(e).__name__:
                print(f"[{label}] response_format error on {entry.provider}:{entry.model} — retrying without it")
                try:
                    result = _dispatch_completion(
                        entry, messages=messages, tools=tools,
                        tool_choice=tool_choice, temperature=temperature,
                        max_tokens=max_tokens,
                    )
                    return result, entry
                except Exception as e2:
                    if _is_rate_limit_error(e2):
                        _mark_exhausted(entry)
                        continue
                    raise

            # Non-rate-limit error — don't failover, raise immediately
            raise

    # All models exhausted
    raise RuntimeError(
        f"All {len(settings.MODEL_POOL)} models across all providers are rate-limited. "
        f"Please wait for limits to reset. "
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
    # Fetch general context + pre-computed aggregates for richer answers
    collection_name = f"dataset_{dataset_id}"
    query_vector = embed_text(user_message)

    # General semantic search (column info, correlations, samples)
    relevant_chunks = search(collection_name, query_vector, limit=8)
    general_context = "\n".join([
        p.payload["text"] for p in relevant_chunks if p.payload
    ])

    # Aggregate data search (pre-computed stats per category)
    aggregate_chunks = search_aggregates(collection_name, query_vector, limit=8)
    aggregate_context = "\n".join([
        p.payload["text"] for p in aggregate_chunks if p.payload
    ])

    # Combine context, prioritising aggregates for analytical questions
    context_parts = []
    if general_context:
        context_parts.append(f"Dataset information:\n{general_context}")
    if aggregate_context:
        context_parts.append(f"Pre-computed aggregates (use these for faster answers):\n{aggregate_context}")
    context = "\n\n".join(context_parts)

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

    # Classify complexity and determine the right tier for this request
    tier = classify_complexity(user_message)

    # Check if conversation already has a pinned tier (only upgrade, never downgrade)
    pinned_tier = _get_pinned_tier(dataset_id)
    if pinned_tier is not None:
        tier = min(tier, pinned_tier)  # lower number = stronger
    if tier < (pinned_tier or 99):
        _upgrade_tier_pin(dataset_id, tier)

    print(f"[chat_with_muse] Complexity tier={tier} for: "
          f"'{user_message[:80]}...' "
          f"(pinned_tier={pinned_tier})")

    # Call with tools — use pinned model if this dataset has one
    pinned = _get_pinned_model(dataset_id)
    response, model_used = _completion_with_failover(
        messages=messages,
        tools=TOOL_DEFINITIONS,
        tool_choice="auto",
        temperature=0.7,
        max_tokens=2048,
        label="chat_with_muse",
        preferred_model=pinned,
        tier=tier,
    )
    # Pin model to this conversation for consistency across turns
    _pin_model(dataset_id, model_used)

    msg = response.choices[0].message
    chart_config = None
    table_config = None
    mutation_preview = None

    # Mutation tool names — when called, results are previews (not applied yet)
    MUTATION_TOOLS = {
        "remove_outliers", "fill_missing", "drop_columns", "filter_rows",
        "rename_columns", "change_dtype", "remove_duplicates",
    }

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

            # If tool returned a table config, capture it
            if tool_name == "create_table" and "error" not in tool_result:
                table_config = tool_result

            # If tool returned a mutation preview, capture it and store pending
            if (
                tool_name in MUTATION_TOOLS
                and isinstance(tool_result, dict)
                and "preview_id" in tool_result
            ):
                # Pop internal bookkeeping before sending to LLM
                mutation_args = tool_result.pop("_mutation_args", {})
                mutation_preview = tool_result

                # Store in pending_mutations so /api/data/apply can find it
                from app.routers.upload import pending_mutations
                pending_mutations[tool_result["preview_id"]] = {
                    "dataset_id": dataset_id,
                    "action": tool_result["action"],
                    "args": mutation_args,
                }
                print(f"[chat_with_muse] Stored pending mutation: "
                      f"preview_id={tool_result['preview_id']}, "
                      f"action={tool_result['action']}")

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(tool_result, default=str)[:3000],
            })

        # Get next response — pin to same model and tier for consistency
        response, model_used = _completion_with_failover(
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=2048,
            label="chat_with_muse:loop",
            preferred_model=model_used,
            tier=tier,
        )
        msg = response.choices[0].message

    text_content = msg.content or ""
    # Strip <think>…</think> blocks from chain-of-thought models (e.g. Qwen)
    text_content = re.sub(r'<think>[\s\S]*?</think>\s*', '', text_content).strip()
    recommended_charts = None

    # -----------------------------------------------------------------------
    # Fallback 0: parse create_chart() pseudo-code from LLM text.
    # Many models output create_chart(...) as Python text instead of calling
    # the tool.  Parse and execute them against the DataFrame.
    # -----------------------------------------------------------------------
    if chart_config is None and text_content:
        parsed_calls = _parse_create_chart_calls(text_content)
        if parsed_calls:
            executed = _execute_chart_calls(parsed_calls, df)
            if executed:
                # Clean create_chart() blocks and surrounding code fences
                cleaned = re.sub(r'create_chart\s*\([\s\S]*?\n\s*\)', '', text_content)
                cleaned = re.sub(r'```[a-z]*\n\s*\n*```', '', cleaned)
                cleaned = re.sub(r'```[a-z]*\s*```', '', cleaned)
                cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
                text_content = cleaned

                if len(executed) == 1:
                    chart_config = executed[0]["chart_config"]
                else:
                    chart_config = executed[0]["chart_config"]
                    recommended_charts = executed
                print(f"[chat_with_muse] Parsed {len(executed)} create_chart() "
                      f"call(s) from text")

    # -----------------------------------------------------------------------
    # Table Fallback 0: parse create_table() pseudo-code from LLM text
    # -----------------------------------------------------------------------
    if table_config is None and text_content:
        parsed_table_calls = _parse_create_table_calls(text_content)
        if parsed_table_calls:
            executed_tables = _execute_table_calls(parsed_table_calls, df)
            if executed_tables:
                cleaned = re.sub(r'create_table\s*\([\s\S]*?\n\s*\)', '', text_content)
                cleaned = re.sub(r'```[a-z]*\n\s*\n*```', '', cleaned)
                cleaned = re.sub(r'```[a-z]*\s*```', '', cleaned)
                cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
                text_content = cleaned
                table_config = executed_tables[0]
                print(f"[chat_with_muse] Parsed create_table() call from text")

    # -----------------------------------------------------------------------
    # Fallback 1: some models ignore function calling and dump chart JSON
    # directly in their text response.  If we didn't get a chart_config from
    # tool calls, try to extract one from the text and clean the message.
    # -----------------------------------------------------------------------
    if chart_config is None and text_content:
        text_content, extracted_chart = _extract_chart_from_text(text_content)
        if extracted_chart is not None:
            chart_config = extracted_chart

    # -----------------------------------------------------------------------
    # Fallback 2 (deterministic): if the user asked for a visualization but
    # neither tool calls nor inline JSON produced a chart, build one from the
    # dataset profile — completely model-independent.
    # -----------------------------------------------------------------------
    if chart_config is None and _has_viz_intent(user_message):
        print("[chat_with_muse] LLM did not produce a chart — "
              "triggering deterministic fallback")
        chart_config = _build_fallback_chart(
            user_message, text_content, profile, df
        )
        if chart_config is not None:
            # Append a note so the user knows the chart was auto-generated
            text_content = (
                text_content.rstrip()
                + "\n\n📊 *I generated this chart based on your request and the dataset structure.*"
            )

    # -----------------------------------------------------------------------
    # Table Fallback (deterministic): if the user asked for a table but
    # neither tool calls nor pseudo-code produced one, build deterministically.
    # -----------------------------------------------------------------------
    if table_config is None and _has_table_intent(user_message):
        print("[chat_with_muse] LLM did not produce a table — "
              "triggering deterministic table fallback")
        table_config = _build_fallback_table(
            user_message, text_content, profile, df
        )
        if table_config is not None:
            text_content = (
                text_content.rstrip()
                + "\n\n📋 *I generated this table based on your request and the dataset structure.*"
            )

    # -----------------------------------------------------------------------
    # Fallback 3 (recommendation): if the user asked for recommended /
    # suggested visualizations and we haven't produced recommended_charts yet,
    # call suggest_visualizations() to generate multiple chart options.
    # -----------------------------------------------------------------------
    if recommended_charts is None and _has_recommendation_intent(user_message):
        print("[chat_with_muse] Recommendation intent detected — "
              "generating suggested visualizations")
        try:
            sample_rows = profile.get("sample_rows", [])
            raw_suggestions = suggest_visualizations(profile, sample_rows)
            rec_charts = []
            for spec in raw_suggestions:
                try:
                    _ct = spec.get("chart_type", "bar")
                    _xc = spec.get("x_column", "")
                    _yc = spec.get("y_columns", [])
                    _gb = spec.get("group_by")
                    _ag = spec.get("aggregation", "sum")
                    _lm = spec.get("limit", 20)
                    if not _xc or not _yc:
                        continue
                    _cfg = create_chart_data(
                        df, chart_type=_ct, x_column=_xc, y_columns=_yc,
                        group_by=_gb if isinstance(_gb, str) else None,
                        aggregation=_ag, limit=_lm,
                    )
                    if "error" in _cfg:
                        continue
                    if spec.get("title"):
                        _cfg["title"] = spec["title"]
                    rec_charts.append({
                        "title": spec.get("title", _cfg.get("title", "Chart")),
                        "description": spec.get("description", ""),
                        "chart_config": _cfg,
                    })
                except Exception:
                    continue
            if rec_charts:
                recommended_charts = rec_charts
                if chart_config is None and rec_charts:
                    chart_config = rec_charts[0]["chart_config"]
                if not text_content.strip():
                    text_content = (
                        "Here are my recommended visualizations for your dataset. "
                        "Click any chart to add it to your dashboard!"
                    )
        except Exception as e:
            print(f"[chat_with_muse] Recommendation generation failed: {e}")

    return {
        "content": text_content,
        "chart_config": chart_config,
        "table_config": table_config,
        "recommended_charts": recommended_charts,
        "mutation_preview": mutation_preview,
    }


def suggest_visualizations(profile: dict, sample_rows: list[dict]) -> list[dict]:
    """Get AI-suggested visualizations for a dataset."""
    prompt = VISUALIZATION_SUGGESTION_PROMPT.format(
        profile=json.dumps(profile, default=str)[:3000],
        sample_rows=json.dumps(sample_rows[:5], default=str)[:1000],
    )

    try:
        response, _ = _completion_with_failover(
            messages=[
                {"role": "system", "content": MUSE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=3000,
            response_format={"type": "json_object"},
            label="suggest_visualizations",
            tier=1,  # needs reliable JSON output + reasoning
        )
    except Exception as e:
        print(f"[suggest_visualizations] All attempts failed: {e}")
        # Last-ditch: try without response_format
        response, _ = _completion_with_failover(
            messages=[
                {"role": "system", "content": "You are a data visualization assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=3000,
            label="suggest_visualizations:fallback",
            tier=1,
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
        response, _ = _completion_with_failover(
            messages=[
                {"role": "system", "content": MUSE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=4000,
            response_format={"type": "json_object"},
            label="generate_story_draft",
            tier=1,  # needs strong reasoning + long narrative output
        )
    except Exception as e:
        print(f"[generate_story_draft] All attempts failed: {e}")
        # Last-ditch without response_format
        response, _ = _completion_with_failover(
            messages=[
                {"role": "system", "content": "You are a data storytelling assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=4000,
            label="generate_story_draft:fallback",
            tier=1,
        )

    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        return {"title": "Your Data Story", "chapters": []}

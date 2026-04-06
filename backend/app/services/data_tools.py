"""
Data analysis tools that Muse can invoke via function calling.
Each function takes a pandas DataFrame and parameters, returns results.
"""
import pandas as pd
import numpy as np
from typing import Optional


def query_data(
    df: pd.DataFrame,
    columns: Optional[list[str]] = None,
    filters: Optional[list[dict]] = None,
    group_by: Optional[list[str]] = None,
    aggregation: str = "sum",
    sort_by: Optional[str] = None,
    sort_ascending: bool = True,
    limit: int = 50,
) -> dict:
    """
    Query and transform data — filter, group, aggregate, sort.
    filters: [{"column": "region", "operator": "==", "value": "North"}]
    """
    result = df.copy()

    # Apply filters
    if filters:
        for f in filters:
            col, op, val = f["column"], f["operator"], f["value"]
            if col not in result.columns:
                continue
            if op == "==":
                result = result[result[col] == val]
            elif op == "!=":
                result = result[result[col] != val]
            elif op == ">":
                result = result[result[col] > float(val)]
            elif op == "<":
                result = result[result[col] < float(val)]
            elif op == ">=":
                result = result[result[col] >= float(val)]
            elif op == "<=":
                result = result[result[col] <= float(val)]
            elif op == "contains":
                result = result[result[col].astype(str).str.contains(str(val), case=False, na=False)]
            elif op == "in":
                result = result[result[col].isin(val if isinstance(val, list) else [val])]

    # Select columns
    if columns:
        valid_cols = [c for c in columns if c in result.columns]
        if valid_cols:
            # Keep group_by columns too
            if group_by:
                valid_cols = list(set(valid_cols + [g for g in group_by if g in result.columns]))
            result = result[valid_cols]

    # Group by
    if group_by:
        valid_groups = [g for g in group_by if g in result.columns]
        if valid_groups:
            numeric_cols = result.select_dtypes(include="number").columns.tolist()
            numeric_cols = [c for c in numeric_cols if c not in valid_groups]
            if aggregation == "sum":
                result = result.groupby(valid_groups)[numeric_cols].sum().reset_index()
            elif aggregation == "mean":
                result = result.groupby(valid_groups)[numeric_cols].mean().round(2).reset_index()
            elif aggregation == "count":
                result = result.groupby(valid_groups).size().reset_index(name="count")
            elif aggregation == "min":
                result = result.groupby(valid_groups)[numeric_cols].min().reset_index()
            elif aggregation == "max":
                result = result.groupby(valid_groups)[numeric_cols].max().reset_index()
            elif aggregation == "median":
                result = result.groupby(valid_groups)[numeric_cols].median().round(2).reset_index()

    # Sort
    if sort_by and sort_by in result.columns:
        result = result.sort_values(by=sort_by, ascending=sort_ascending)

    # Limit
    result = result.head(limit)

    return {
        "data": result.fillna("").to_dict(orient="records"),
        "row_count": len(result),
        "columns": result.columns.tolist(),
    }


def compute_stats(
    df: pd.DataFrame,
    column: str,
    stat_type: str = "summary",
    group_by: str = None,
) -> dict:
    """
    Compute statistics for a column.
    stat_type: summary, growth, percentages, ranking, distribution
    """
    if column not in df.columns:
        return {"error": f"Column '{column}' not found"}

    if stat_type == "summary":
        if pd.api.types.is_numeric_dtype(df[column]):
            return {
                "column": column,
                "type": "numeric",
                "count": int(df[column].count()),
                "mean": round(float(df[column].mean()), 2),
                "median": round(float(df[column].median()), 2),
                "std": round(float(df[column].std()), 2),
                "min": round(float(df[column].min()), 2),
                "max": round(float(df[column].max()), 2),
                "q25": round(float(df[column].quantile(0.25)), 2),
                "q75": round(float(df[column].quantile(0.75)), 2),
            }
        else:
            vc = df[column].value_counts()
            return {
                "column": column,
                "type": "categorical",
                "unique_count": int(df[column].nunique()),
                "most_common": vc.head(5).to_dict(),
                "least_common": vc.tail(3).to_dict(),
            }

    elif stat_type == "growth":
        if not pd.api.types.is_numeric_dtype(df[column]):
            return {"error": "Growth calculation requires a numeric column"}
        if group_by and group_by in df.columns:
            grouped = df.groupby(group_by)[column].sum().sort_index()
        else:
            grouped = df[column]
        pct_change = grouped.pct_change().dropna() * 100
        return {
            "column": column,
            "growth_rates": pct_change.round(2).to_dict(),
            "avg_growth": round(float(pct_change.mean()), 2),
            "max_growth": round(float(pct_change.max()), 2),
            "min_growth": round(float(pct_change.min()), 2),
        }

    elif stat_type == "percentages":
        if pd.api.types.is_numeric_dtype(df[column]) and group_by:
            totals = df.groupby(group_by)[column].sum()
            pcts = (totals / totals.sum() * 100).round(2)
            return {
                "column": column,
                "group_by": group_by,
                "percentages": pcts.to_dict(),
                "total": round(float(totals.sum()), 2),
            }
        else:
            vc = df[column].value_counts(normalize=True) * 100
            return {
                "column": column,
                "percentages": vc.round(2).head(10).to_dict(),
            }

    elif stat_type == "ranking":
        if group_by and group_by in df.columns:
            ranked = df.groupby(group_by)[column].sum().sort_values(ascending=False)
            return {
                "column": column,
                "ranked_by": group_by,
                "ranking": [{"rank": i+1, "name": str(k), "value": round(float(v), 2)}
                           for i, (k, v) in enumerate(ranked.items())],
            }
        return {"error": "Ranking requires a group_by column"}

    elif stat_type == "distribution":
        if pd.api.types.is_numeric_dtype(df[column]):
            hist, edges = np.histogram(df[column].dropna(), bins=10)
            return {
                "column": column,
                "bins": [{"range": f"{round(edges[i], 2)}-{round(edges[i+1], 2)}",
                         "count": int(hist[i])} for i in range(len(hist))],
            }
        return {"error": "Distribution requires a numeric column"}

    return {"error": f"Unknown stat_type: {stat_type}"}


def detect_patterns(
    df: pd.DataFrame,
    analysis_type: str = "overview",
    column: str = None,
) -> dict:
    """
    Detect patterns, outliers, correlations, and anomalies.
    analysis_type: overview, outliers, correlations, trends
    """
    if analysis_type == "overview":
        patterns = []
        numeric_cols = df.select_dtypes(include="number").columns.tolist()

        # Check for correlations
        if len(numeric_cols) >= 2:
            corr = df[numeric_cols].corr()
            for i, c1 in enumerate(numeric_cols):
                for c2 in numeric_cols[i+1:]:
                    r = corr.loc[c1, c2]
                    if abs(r) > 0.7:
                        direction = "go up together" if r > 0 else "move in opposite directions"
                        patterns.append(
                            f"'{c1}' and '{c2}' are strongly connected — they {direction} "
                            f"(correlation: {r:.2f})"
                        )

        # Check for skewed distributions
        for col in numeric_cols:
            skew = df[col].skew()
            if abs(skew) > 1.5:
                direction = "bunched up at the low end with a few very high values" if skew > 0 \
                    else "bunched up at the high end with a few very low values"
                patterns.append(f"'{col}' is {direction} (skewness: {skew:.2f})")

        # Check for high null rates
        for col in df.columns:
            null_pct = df[col].isna().mean() * 100
            if null_pct > 10:
                patterns.append(f"'{col}' is missing {null_pct:.1f}% of its values")

        return {"patterns": patterns, "total_found": len(patterns)}

    elif analysis_type == "outliers" and column and column in df.columns:
        if not pd.api.types.is_numeric_dtype(df[column]):
            return {"error": "Outlier detection requires a numeric column"}
        q1 = df[column].quantile(0.25)
        q3 = df[column].quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        outliers = df[(df[column] < lower) | (df[column] > upper)]
        return {
            "column": column,
            "outlier_count": len(outliers),
            "total_rows": len(df),
            "outlier_percentage": round(len(outliers) / len(df) * 100, 2),
            "lower_bound": round(float(lower), 2),
            "upper_bound": round(float(upper), 2),
            "outlier_values": outliers[column].head(10).tolist(),
            "normal_range": f"{round(float(lower), 2)} to {round(float(upper), 2)}",
        }

    elif analysis_type == "correlations":
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if len(numeric_cols) < 2:
            return {"error": "Need at least 2 numeric columns for correlation analysis"}
        corr = df[numeric_cols].corr()
        pairs = []
        for i, c1 in enumerate(numeric_cols):
            for c2 in numeric_cols[i+1:]:
                r = corr.loc[c1, c2]
                pairs.append({"col1": c1, "col2": c2, "correlation": round(float(r), 3)})
        pairs.sort(key=lambda x: abs(x["correlation"]), reverse=True)
        return {"correlations": pairs}

    elif analysis_type == "trends" and column and column in df.columns:
        if not pd.api.types.is_numeric_dtype(df[column]):
            return {"error": "Trend detection requires a numeric column"}
        values = df[column].dropna().tolist()
        if len(values) < 3:
            return {"error": "Not enough data points for trend analysis"}
        # Simple trend: compare first half vs second half
        mid = len(values) // 2
        first_half_avg = sum(values[:mid]) / mid
        second_half_avg = sum(values[mid:]) / (len(values) - mid)
        change_pct = ((second_half_avg - first_half_avg) / first_half_avg * 100) if first_half_avg != 0 else 0
        direction = "upward" if change_pct > 5 else "downward" if change_pct < -5 else "stable"
        return {
            "column": column,
            "direction": direction,
            "change_percentage": round(change_pct, 2),
            "first_half_avg": round(first_half_avg, 2),
            "second_half_avg": round(second_half_avg, 2),
        }

    return {"error": f"Unknown analysis_type: {analysis_type}"}


def create_chart_data(
    df: pd.DataFrame,
    chart_type: str,
    x_column: str,
    y_columns: list[str],
    group_by: Optional[str] = None,
    aggregation: str = "sum",
    filters: Optional[list[dict]] = None,
    limit: int = 20,
    colors: Optional[list[str]] = None,
) -> dict:
    """
    Prepare data and config for a Recharts visualization.
    This is the main chart generation tool — turns a data query into a chart config.
    """
    DEFAULT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
    colors = colors or DEFAULT_COLORS

    result = df.copy()

    # Apply filters
    if filters:
        for f in filters:
            col, op, val = f["column"], f["operator"], f["value"]
            if col in result.columns:
                if op == "==":
                    result = result[result[col] == val]
                elif op == "!=":
                    result = result[result[col] != val]
                elif op == ">":
                    result = result[result[col] > float(val)]
                elif op == "<":
                    result = result[result[col] < float(val)]
                elif op == "in":
                    result = result[result[col].isin(val if isinstance(val, list) else [val])]

    # Group and aggregate
    valid_y = [c for c in y_columns if c in result.columns]
    if not valid_y:
        return {"error": "No valid y-axis columns found"}

    if group_by and group_by in result.columns:
        if aggregation == "sum":
            result = result.groupby(group_by)[valid_y].sum().reset_index()
        elif aggregation == "mean":
            result = result.groupby(group_by)[valid_y].mean().round(2).reset_index()
        elif aggregation == "count":
            result = result.groupby(group_by).size().reset_index(name="count")
            valid_y = ["count"]
        x_column = group_by
    elif x_column and x_column in result.columns:
        # Sort by x_column if it looks like dates
        try:
            result[x_column] = pd.to_datetime(result[x_column])
            result = result.sort_values(x_column)
            result[x_column] = result[x_column].dt.strftime('%Y-%m-%d')
        except (ValueError, TypeError):
            pass

    result = result.head(limit)

    # Build chart config
    series = [
        {
            "dataKey": col,
            "color": colors[i % len(colors)],
            "type": chart_type if chart_type in ["line", "area"] else "bar",
        }
        for i, col in enumerate(valid_y)
    ]

    # Generate a friendly title
    y_labels = " & ".join(valid_y)
    x_label = x_column or "items"
    title = f"{y_labels} by {x_label}"

    chart_config = {
        "chart_type": chart_type,
        "title": title,
        "data": result.fillna(0).to_dict(orient="records"),
        "config": {
            "xAxisKey": x_column,
            "series": series,
        }
    }

    return chart_config


# Tool definitions for Groq function calling
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "query_data",
            "description": "Query and transform the dataset — filter rows, select columns, group by categories, aggregate values, and sort. Use this whenever the user wants to see specific slices of their data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "columns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Which columns to include in the result"
                    },
                    "filters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "operator": {"type": "string", "enum": ["==", "!=", ">", "<", ">=", "<=", "contains", "in"]},
                                "value": {}
                            },
                            "required": ["column", "operator", "value"]
                        },
                        "description": "Filters to apply to the data"
                    },
                    "group_by": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Columns to group by"
                    },
                    "aggregation": {
                        "type": "string",
                        "enum": ["sum", "mean", "count", "min", "max", "median"],
                        "description": "How to aggregate grouped values"
                    },
                    "sort_by": {"type": "string", "description": "Column to sort by"},
                    "sort_ascending": {"type": "boolean", "description": "Sort ascending (true) or descending (false)"},
                    "limit": {"type": "integer", "description": "Max rows to return (default 50)"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_chart",
            "description": "Create a visualization from the data. Use this whenever the user asks to see a chart, graph, or visual. Generates the chart data and configuration for rendering.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_type": {
                        "type": "string",
                        "enum": ["bar", "line", "pie", "area", "scatter", "composed"],
                        "description": "Type of chart to create"
                    },
                    "x_column": {"type": "string", "description": "Column for the x-axis or categories"},
                    "y_columns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Column(s) for the y-axis values"
                    },
                    "group_by": {"type": "string", "description": "Column to group/aggregate by before charting"},
                    "aggregation": {
                        "type": "string",
                        "enum": ["sum", "mean", "count", "min", "max"],
                        "description": "How to aggregate if grouping"
                    },
                    "filters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "operator": {"type": "string"},
                                "value": {}
                            }
                        },
                        "description": "Filters to apply before charting"
                    },
                    "limit": {"type": "integer", "description": "Max data points (default 20)"},
                    "colors": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Custom hex colors for the chart series"
                    }
                },
                "required": ["chart_type", "x_column", "y_columns"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compute_stats",
            "description": "Calculate specific statistics for a column — summary stats, growth rates, percentages, rankings, or distributions. Use when the user asks analytical questions like 'what's the average?', 'which is highest?', 'what's the growth rate?'",
            "parameters": {
                "type": "object",
                "properties": {
                    "column": {"type": "string", "description": "Column to analyze"},
                    "stat_type": {
                        "type": "string",
                        "enum": ["summary", "growth", "percentages", "ranking", "distribution"],
                        "description": "Type of statistical analysis"
                    },
                    "group_by": {"type": "string", "description": "Optional column to group by before computing stats"}
                },
                "required": ["column", "stat_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "detect_patterns",
            "description": "Find patterns, outliers, correlations, and trends in the data. Use when the user asks 'anything interesting?', 'any outliers?', 'what patterns do you see?', or 'is there a trend?'",
            "parameters": {
                "type": "object",
                "properties": {
                    "analysis_type": {
                        "type": "string",
                        "enum": ["overview", "outliers", "correlations", "trends"],
                        "description": "What kind of pattern to look for"
                    },
                    "column": {"type": "string", "description": "Specific column to analyze (required for outliers and trends)"}
                },
                "required": ["analysis_type"]
            }
        }
    }
]


def execute_tool(tool_name: str, arguments: dict, df: pd.DataFrame) -> dict:
    """Execute a tool call and return the result."""
    if tool_name == "query_data":
        return query_data(df, **arguments)
    elif tool_name == "create_chart":
        return create_chart_data(df, **arguments)
    elif tool_name == "compute_stats":
        return compute_stats(df, **arguments)
    elif tool_name == "detect_patterns":
        return detect_patterns(df, **arguments)
    else:
        return {"error": f"Unknown tool: {tool_name}"}

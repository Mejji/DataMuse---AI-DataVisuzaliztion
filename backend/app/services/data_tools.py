"""
Data analysis tools that Muse can invoke via function calling.
Each function takes a pandas DataFrame and parameters, returns results.
"""
import uuid
import pandas as pd
import numpy as np
from typing import Any, Optional, cast


LARGE_DATASET_THRESHOLD = 10_000


def _apply_filters(df: pd.DataFrame, filters: list[dict]) -> pd.DataFrame:
    """Apply a list of filter dicts to *df* and return the filtered view.

    Uses boolean indexing on the original DataFrame (no copy) so that
    memory stays flat even on 40k+ row datasets.
    """
    mask = pd.Series(True, index=df.index)
    for f in filters:
        col, op, val = f["column"], f["operator"], f["value"]
        if col not in df.columns:
            continue
        if op == "==":
            mask &= df[col] == val
        elif op == "!=":
            mask &= df[col] != val
        elif op == ">":
            mask &= df[col] > float(val)
        elif op == "<":
            mask &= df[col] < float(val)
        elif op == ">=":
            mask &= df[col] >= float(val)
        elif op == "<=":
            mask &= df[col] <= float(val)
        elif op == "contains":
            mask &= df[col].astype(str).str.contains(str(val), case=False, na=False)
        elif op == "in":
            mask &= df[col].isin(val if isinstance(val, list) else [val])
    filtered: pd.DataFrame = df.loc[mask]  # type: ignore[assignment]
    return filtered


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

    For large datasets (>10k rows) this avoids a full ``df.copy()`` by
    building a boolean mask first and only materialising the slice that
    is actually needed.

    filters: [{"column": "region", "operator": "==", "value": "North"}]
    """
    # --- 1. filter (no copy — boolean mask) ---
    result = _apply_filters(df, filters) if filters else df

    # --- 2. select columns ---
    if columns:
        valid_cols = [c for c in columns if c in result.columns]
        if valid_cols:
            if group_by:
                valid_cols = list(set(valid_cols + [g for g in group_by if g in result.columns]))
            result = result[valid_cols]

    # --- 3. group / aggregate ---
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
                count_series = cast(pd.Series, result.groupby(valid_groups).size())
                count_df = count_series.to_frame()
                count_df.columns = ["count"]
                result = count_df.reset_index()
            elif aggregation == "min":
                result = result.groupby(valid_groups)[numeric_cols].min().reset_index()
            elif aggregation == "max":
                result = result.groupby(valid_groups)[numeric_cols].max().reset_index()
            elif aggregation == "median":
                result = result.groupby(valid_groups)[numeric_cols].median().round(2).reset_index()

    # --- 4. sort ---
    if sort_by and sort_by in result.columns:
        result = cast(pd.DataFrame, result).sort_values(by=[cast(str, sort_by)], ascending=sort_ascending)

    # --- 5. limit ---
    result = result.head(limit)

    result_df = cast(pd.DataFrame, result)
    return {
        "data": cast(Any, result_df.fillna("").to_dict("records")),
        "row_count": len(result_df),
        "columns": result_df.columns.tolist(),
    }


def compute_stats(
    df: pd.DataFrame,
    column: str,
    stat_type: str = "summary",
    group_by: Optional[str] = None,
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
            ranked = cast(pd.Series, df.groupby(group_by)[column].sum()).sort_values(ascending=False)
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
    column: Optional[str] = None,
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
            corr_df = pd.DataFrame(df.loc[:, numeric_cols])
            corr = corr_df.corr()
            for i, c1 in enumerate(numeric_cols):
                for c2 in numeric_cols[i+1:]:
                    r = float(corr.loc[c1, c2])
                    if abs(float(r)) > 0.7:
                        direction = "go up together" if r > 0 else "move in opposite directions"
                        patterns.append(
                            f"'{c1}' and '{c2}' are strongly connected — they {direction} "
                            f"(correlation: {r:.2f})"
                        )

        # Check for skewed distributions
        for col in numeric_cols:
            skew = float(df[col].skew())
            if abs(float(skew)) > 1.5:
                direction = "bunched up at the low end with a few very high values" if float(skew) > 0 \
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
            "outlier_values": pd.Series(outliers[column]).head(10).tolist(),
            "normal_range": f"{round(float(lower), 2)} to {round(float(upper), 2)}",
        }

    elif analysis_type == "correlations":
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if len(numeric_cols) < 2:
            return {"error": "Need at least 2 numeric columns for correlation analysis"}
        corr_df = pd.DataFrame(df.loc[:, numeric_cols])
        corr = corr_df.corr()
        pairs = []
        for i, c1 in enumerate(numeric_cols):
            for c2 in numeric_cols[i+1:]:
                r = float(corr.loc[c1, c2])
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


def create_table_data(
    df: pd.DataFrame,
    columns: Optional[list[str]] = None,
    group_by: Optional[str] = None,
    aggregation: str = "sum",
    filters: Optional[list[dict]] = None,
    sort_by: Optional[str] = None,
    sort_ascending: bool = False,
    limit: int = 20,
    title: Optional[str] = None,
) -> dict:
    """
    Prepare data for rendering as an HTML-style table on the dashboard.

    Returns a table_config dict with columns, rows, and metadata.
    Works like query_data but produces a frontend-ready table structure.
    """
    # --- 1. filter (no copy) ---
    result: pd.DataFrame = _apply_filters(df, filters) if filters else df

    # --- 2. select columns ---
    if columns:
        valid_cols = [c for c in columns if c in result.columns]
        if not valid_cols:
            return {"error": f"No valid columns found. Available: {result.columns.tolist()[:20]}"}
        if group_by and group_by not in valid_cols:
            valid_cols.insert(0, group_by)
        result = cast(pd.DataFrame, result[valid_cols])
    else:
        valid_cols = result.columns.tolist()

    # --- 3. group / aggregate ---
    if group_by and group_by in result.columns:
        numeric_cols = result.select_dtypes(include="number").columns.tolist()
        numeric_cols = [c for c in numeric_cols if c != group_by]
        if aggregation == "count":
            count_series = cast(pd.Series, result.groupby(group_by).size())
            count_df = count_series.to_frame()
            count_df.columns = ["count"]
            result = count_df.reset_index()
        elif numeric_cols:
            agg_func = {
                "sum": "sum", "mean": "mean", "min": "min",
                "max": "max", "median": "median",
            }.get(aggregation, "sum")
            result = cast(pd.DataFrame, result.groupby(group_by)[numeric_cols].agg(agg_func))
            if agg_func in ("mean", "median"):
                result = result.round(2)
            result = result.reset_index()

    # --- 4. sort ---
    if sort_by and sort_by in result.columns:
        result = cast(pd.DataFrame, result).sort_values(by=[cast(str, sort_by)], ascending=sort_ascending)
    elif group_by and len(result.columns) > 1:
        # Default: sort by first numeric column descending
        num_cols = result.select_dtypes(include="number").columns.tolist()
        if num_cols:
            result = result.sort_values(by=num_cols[0], ascending=False)

    # --- 5. limit ---
    result = result.head(limit)

    # --- 6. build table config ---
    table_columns = []
    for col in result.columns:
        is_numeric = pd.api.types.is_numeric_dtype(result[col])
        table_columns.append({
            "key": col,
            "label": col.replace("_", " ").title(),
            "type": "number" if is_numeric else "text",
        })

    # Round numeric values for display
    display_df = result.copy()
    for col in display_df.select_dtypes(include="number").columns:
        display_df[col] = display_df[col].round(2)

    rows = display_df.fillna("—").to_dict("records")

    # Auto-generate title if not provided
    if not title:
        if group_by:
            agg_label = aggregation.title() if aggregation != "sum" else "Total"
            num_cols = [c for c in result.columns if c != group_by and pd.api.types.is_numeric_dtype(result[c])]
            value_label = " & ".join(num_cols[:3]) if num_cols else "values"
            title = f"{agg_label} {value_label} by {group_by.replace('_', ' ').title()}"
        else:
            title = f"Data Table ({len(rows)} rows)"

    return {
        "table_type": "data",
        "title": title,
        "columns": table_columns,
        "rows": rows,
        "row_count": len(rows),
        "total_rows": len(df),
    }


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

    For large datasets (>10 000 rows) this function avoids a full copy
    and instead works on filtered views.  When a categorical x-column
    has too many unique values the chart is automatically reduced to
    the top-N categories (by the first y-column) plus an "Other" bucket
    so that the resulting chart is always readable.
    """
    DEFAULT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
    colors = colors or DEFAULT_COLORS

    # --- 1. filter (no copy) ---
    result: pd.DataFrame = _apply_filters(df, filters) if filters else df

    # --- 2. validate y columns ---
    valid_y = [c for c in y_columns if c in result.columns]
    if not valid_y:
        return {"error": "No valid y-axis columns found"}

    # --- 2b. auto-detect categorical y-columns and convert to count ---
    # If ALL y-columns are non-numeric (e.g., "yes"/"no", "sunny"/"rainy"),
    # Recharts cannot render them as bar heights.  Auto-switch to counting
    # occurrences grouped by x_column so the chart is meaningful.
    _all_y_categorical = all(
        not pd.api.types.is_numeric_dtype(result[c]) for c in valid_y
    )
    if _all_y_categorical and x_column and x_column in result.columns:
        # Use the first categorical y-column as the group-by dimension
        # and count occurrences per x_column value.
        cat_col = valid_y[0]
        if chart_type in ("pie", "donut"):
            # For pie/donut: count occurrences of each value in the
            # categorical column itself (ignore x_column).
            count_df = result[cat_col].value_counts().reset_index()
            count_df.columns = [cat_col, "count"]
            result = count_df.head(limit)
            x_column = cat_col
            valid_y = ["count"]
        else:
            # For bar/line/etc: count rows per x_column value
            count_series = result.groupby(x_column).size()
            count_df = count_series.reset_index()
            count_df.columns = [x_column, "count"]
            result = count_df
            valid_y = ["count"]
        print(f"[create_chart_data] Auto-converted categorical y-columns to "
              f"count aggregation (original y: {y_columns})")

    # --- 3. group / aggregate ---
    _already_aggregated = False
    if group_by and group_by in result.columns:
        if aggregation == "sum":
            result = result.groupby(group_by)[valid_y].sum().reset_index()
        elif aggregation == "mean":
            result = result.groupby(group_by)[valid_y].mean().round(2).reset_index()
        elif aggregation == "count":
            count_series = cast(pd.Series, result.groupby(group_by).size())
            count_df = count_series.to_frame()
            count_df.columns = ["count"]
            result = count_df.reset_index()
            valid_y = ["count"]
        x_column = group_by
        _already_aggregated = True
    elif x_column and x_column in result.columns:
        is_large = len(result) > LARGE_DATASET_THRESHOLD
        is_numeric_x = pd.api.types.is_numeric_dtype(result[x_column])
        is_categorical_x = not is_numeric_x

        # For large datasets with a categorical x-axis and no explicit
        # group_by, auto-aggregate so the chart shows meaningful totals
        # instead of individual rows.
        if is_large and is_categorical_x:
            n_unique = result[x_column].nunique()
            if n_unique > limit:
                # Aggregate by x_column, keep top-N, bucket rest as "Other"
                agg_df = result.groupby(x_column)[valid_y].sum().reset_index()
                agg_df = agg_df.sort_values(valid_y[0], ascending=False)
                top = agg_df.head(limit - 1)
                rest = agg_df.iloc[limit - 1:]
                if len(rest) > 0:
                    other_row = {x_column: "Other"}
                    for yc in valid_y:
                        other_row[yc] = rest[yc].sum()
                    other_df = pd.DataFrame([other_row])
                    result = pd.concat([top, other_df], ignore_index=True)
                else:
                    result = top
                _already_aggregated = True
            else:
                # Few enough categories — just aggregate
                result = result.groupby(x_column)[valid_y].sum().reset_index()
                result = result.sort_values(valid_y[0], ascending=False)
                _already_aggregated = True
        else:
            # Date / numeric x-axis — sort and truncate
            if is_numeric_x:
                # Already numeric — just sort, never coerce to datetime
                result = result.sort_values(x_column)
            else:
                try:
                    result = result.copy()  # copy only when we need to mutate
                    result[x_column] = pd.to_datetime(result[x_column])
                    result = result.sort_values(x_column)
                    result[x_column] = result[x_column].dt.strftime('%Y-%m-%d')
                except (ValueError, TypeError):
                    pass

    # --- 3b. Smart aggregation for categorical charts ---
    CATEGORICAL_CHARTS = {
        "treemap", "pie", "donut", "funnel", "bar", "groupedBar",
        "stackedBar", "radar", "radialBar", "waterfall", "composed",
    }
    if (
        not _already_aggregated
        and chart_type in CATEGORICAL_CHARTS
        and x_column
        and x_column in result.columns
        and not pd.api.types.is_numeric_dtype(result[x_column])
        and result[x_column].nunique() < len(result)
    ):
        agg_func = {
            "sum": "sum",
            "mean": "mean",
            "count": "count",
            "min": "min",
            "max": "max",
            "median": "median",
        }.get(aggregation, "sum")
        numeric_y = [c for c in valid_y if pd.api.types.is_numeric_dtype(result[c])]
        if agg_func == "count":
            count_series = result.groupby(x_column).size()
            result = count_series.reset_index()
            result.columns = [x_column, "count"]
            valid_y = ["count"]
        elif numeric_y:
            result = result.groupby(x_column)[numeric_y].agg(agg_func).reset_index()
            valid_y = numeric_y
            if agg_func in ("mean", "median"):
                for c in numeric_y:
                    result[c] = result[c].round(2)

        if valid_y and valid_y[0] in result.columns:
            result = result.sort_values(valid_y[0], ascending=False)

        MAX_SLICES = 8
        if chart_type in ("pie", "donut", "treemap") and len(result) > MAX_SLICES:
            top = result.head(MAX_SLICES - 1)
            rest = result.iloc[MAX_SLICES - 1:]
            other_row: dict[str, Any] = {x_column: "Other"}
            for yc in valid_y:
                if yc in rest.columns:
                    other_row[yc] = rest[yc].sum()
            result = pd.concat([top, pd.DataFrame([other_row])], ignore_index=True)

    result = result.head(limit)

    y_labels = " & ".join(valid_y)
    x_label = x_column or "items"
    title = f"{y_labels} by {x_label}"

    # --- 4. build chart config ---
    if chart_type == "treemap":
        # Treemap needs flat data with 'name' and 'size' keys
        treemap_data = []
        for row in result.fillna(0).to_dict("records"):
            name = str(row.get(x_column, ""))
            size = sum(float(row.get(y, 0)) for y in valid_y)
            treemap_data.append({"name": name, "size": round(size, 2)})
        treemap_data = [d for d in treemap_data if d["size"] > 0]
        chart_config = {
            "chart_type": "treemap",
            "title": title,
            "data": treemap_data,
            "config": {
                "xAxisKey": "name",
                "series": [{"dataKey": "size", "color": colors[0], "type": "treemap"}],
            },
        }
        return chart_config

    if chart_type == "funnel":
        funnel_data = []
        for row in result.fillna(0).to_dict("records"):
            name = str(row.get(x_column, ""))
            value = sum(float(row.get(y, 0)) for y in valid_y)
            funnel_data.append({"name": name, "value": round(value, 2)})
        funnel_data.sort(key=lambda x: x["value"], reverse=True)
        chart_config = {
            "chart_type": "funnel",
            "title": title,
            "data": funnel_data,
            "config": {
                "xAxisKey": "name",
                "series": [{"dataKey": "value", "color": colors[0], "type": "funnel"}],
            },
        }
        return chart_config

    if chart_type == "radar":
        scales = {}
        for y in valid_y:
            num_series = pd.Series(pd.to_numeric(result[y], errors="coerce"), index=result.index)
            col_data = num_series.dropna()
            if len(col_data) > 0:
                scales[y] = {"min": float(col_data.min()), "max": float(col_data.max())}

        needs_normalization = False
        if len(scales) >= 2:
            ranges = [(s["max"] - s["min"]) for s in scales.values() if s["max"] != s["min"]]
            if ranges and max(ranges) / max(min(ranges), 0.001) > 10:
                needs_normalization = True

        radar_data = []
        for row in result.fillna(0).to_dict("records"):
            entry: dict[str, Any] = {"subject": str(row.get(x_column, ""))}
            for y in valid_y:
                raw_val = float(row.get(y, 0))
                if needs_normalization and y in scales:
                    s = scales[y]
                    range_val = s["max"] - s["min"]
                    entry[y] = round((raw_val - s["min"]) / range_val * 100, 2) if range_val > 0 else 0
                else:
                    entry[y] = round(raw_val, 2)
            radar_data.append(entry)
        radar_series = [
            {"dataKey": col, "color": colors[i % len(colors)], "type": "radar"}
            for i, col in enumerate(valid_y)
        ]
        chart_config = {
            "chart_type": "radar",
            "title": title + (" (normalized)" if needs_normalization else ""),
            "data": radar_data,
            "config": {"xAxisKey": "subject", "series": radar_series},
        }
        return chart_config

    if chart_type == "radialBar":
        radial_data = []
        for i, row in enumerate(result.fillna(0).to_dict("records")):
            name = str(row.get(x_column, ""))
            value = round(float(row.get(valid_y[0], 0)), 2)
            radial_data.append({"name": name, "value": value, "fill": colors[i % len(colors)]})
        chart_config = {
            "chart_type": "radialBar",
            "title": title,
            "data": radial_data,
            "config": {
                "xAxisKey": "name",
                "series": [{"dataKey": "value", "color": colors[0], "type": "radialBar"}],
            },
        }
        return chart_config

    if chart_type == "histogram":
        # Build histogram by binning the first y-column's numeric values
        col = valid_y[0]
        _num_series = pd.to_numeric(result[col], errors="coerce")
        numeric_vals = cast(pd.Series, _num_series).dropna()
        if len(numeric_vals) == 0:
            return {"error": f"No numeric values in column '{col}' for histogram"}
        counts, bin_edges = np.histogram(numeric_vals.to_numpy(), bins="auto")
        if len(counts) > 30:
            counts, bin_edges = np.histogram(numeric_vals.to_numpy(), bins=30)
        hist_data = []
        for j in range(len(counts)):
            low = float(bin_edges[j])
            high = float(bin_edges[j + 1])
            if abs(high) >= 1000:
                label = f"{int(low)}-{int(high)}"
            elif abs(high) >= 1:
                label = f"{low:.1f}-{high:.1f}"
            else:
                label = f"{low:.3f}-{high:.3f}"
            hist_data.append({"bin": label, "count": int(counts[j])})
        return {
            "chart_type": "histogram",
            "title": f"Distribution of {col}",
            "data": hist_data,
            "config": {
                "xAxisKey": "bin",
                "series": [{"dataKey": "count", "color": colors[0], "type": "bar"}],
            },
        }

    if chart_type == "groupedBar":
        series = [
            {"dataKey": col, "color": colors[i % len(colors)], "type": "bar"}
            for i, col in enumerate(valid_y)
        ]
        return {
            "chart_type": "groupedBar",
            "title": title,
            "data": result.fillna(0).to_dict("records"),
            "config": {"xAxisKey": x_column, "series": series},
        }

    if chart_type == "stackedBar":
        series = [
            {"dataKey": col, "color": colors[i % len(colors)], "type": "bar", "stack": "a"}
            for i, col in enumerate(valid_y)
        ]
        return {
            "chart_type": "stackedBar",
            "title": title,
            "data": result.fillna(0).to_dict("records"),
            "config": {"xAxisKey": x_column, "series": series},
        }

    if chart_type == "donut":
        donut_data = []
        for row in result.fillna(0).to_dict("records"):
            name = str(row.get(x_column, ""))
            value = round(float(row.get(valid_y[0], 0)), 2)
            if value > 0:
                donut_data.append({"name": name, "value": value})
        return {
            "chart_type": "donut",
            "title": title,
            "data": donut_data,
            "config": {
                "xAxisKey": "name",
                "series": [{"dataKey": "value", "color": colors[0], "type": "donut"}],
            },
        }

    if chart_type == "pie":
        pie_data = []
        for row in result.fillna(0).to_dict("records"):
            name = str(row.get(x_column, ""))
            value = round(float(row.get(valid_y[0], 0)), 2)
            if value > 0:
                pie_data.append({"name": name, "value": value})
        return {
            "chart_type": "pie",
            "title": title,
            "data": pie_data,
            "config": {
                "xAxisKey": "name",
                "series": [{"dataKey": "value", "color": colors[0], "type": "pie"}],
            },
        }

    if chart_type == "composed":
        # Re-sort chronologically when x looks like dates
        if x_column and x_column in result.columns:
            try:
                date_order = pd.to_datetime(result[x_column], errors="coerce")
                if date_order.notna().all():
                    result = result.iloc[date_order.argsort()]
            except Exception:
                pass
        series = []
        for i, col in enumerate(valid_y):
            series_type = "bar" if i == 0 else "line"
            series.append({
                "dataKey": col,
                "color": colors[i % len(colors)],
                "type": series_type,
            })
        return {
            "chart_type": "composed",
            "title": title,
            "data": result.fillna(0).to_dict("records"),
            "config": {"xAxisKey": x_column, "series": series},
        }

    if chart_type == "bubble":
        # Needs at least 2 y-columns: y (vertical) and z (bubble size)
        y_key = valid_y[0]
        z_key = valid_y[1] if len(valid_y) > 1 else valid_y[0]
        bubble_data = []
        for row in result.fillna(0).to_dict("records"):
            bubble_data.append({
                "x": round(float(row.get(x_column, 0)), 2) if pd.api.types.is_numeric_dtype(result[x_column]) else str(row.get(x_column, "")),
                "y": round(float(row.get(y_key, 0)), 2),
                "z": round(float(row.get(z_key, 0)), 2),
                "_label": str(row.get(x_column, "")),
            })
        return {
            "chart_type": "bubble",
            "title": title,
            "data": bubble_data,
            "config": {
                "xAxisKey": "x",
                "series": [
                    {"dataKey": "y", "color": colors[0], "type": "scatter"},
                    {"dataKey": "z", "color": colors[1], "type": "size"},
                ],
            },
        }

    if chart_type == "waterfall":
        # Build a waterfall with cumulative start/end values
        waterfall_data = []
        cumulative = 0.0
        records = result.fillna(0).to_dict("records")
        for row in records:
            name = str(row.get(x_column, ""))
            value = round(float(row.get(valid_y[0], 0)), 2)
            start = cumulative
            cumulative += value
            waterfall_data.append({
                "name": name,
                "value": value,
                "start": round(start, 2),
                "end": round(cumulative, 2),
                "isTotal": False,
            })
        # Add total bar
        waterfall_data.append({
            "name": "Total",
            "value": round(cumulative, 2),
            "start": 0,
            "end": round(cumulative, 2),
            "isTotal": True,
        })
        return {
            "chart_type": "waterfall",
            "title": title,
            "data": waterfall_data,
            "config": {
                "xAxisKey": "name",
                "series": [{"dataKey": "value", "color": colors[2], "type": "bar"}],
            },
        }

    if chart_type == "boxPlot":
        # Compute quartiles per category (x_column groups, y is the numeric column)
        col = valid_y[0]
        numeric_col = cast(pd.Series, pd.to_numeric(result[col], errors="coerce"))
        if x_column and x_column in result.columns and x_column != col:
            grouped = result.assign(_num=numeric_col).dropna(subset=["_num"]).groupby(x_column)["_num"]
            box_data = []
            for name, group in grouped:
                q1 = round(float(group.quantile(0.25)), 2)
                q3 = round(float(group.quantile(0.75)), 2)
                box_data.append({
                    "category": str(name),
                    "min": round(float(group.min()), 2),
                    "q1": q1,
                    "median": round(float(group.median()), 2),
                    "q3": q3,
                    "max": round(float(group.max()), 2),
                })
        else:
            vals = numeric_col.dropna()
            q1 = round(float(vals.quantile(0.25)), 2)
            q3 = round(float(vals.quantile(0.75)), 2)
            box_data = [{
                "category": col,
                "min": round(float(vals.min()), 2),
                "q1": q1,
                "median": round(float(vals.median()), 2),
                "q3": q3,
                "max": round(float(vals.max()), 2),
            }]
        return {
            "chart_type": "boxPlot",
            "title": f"Distribution of {col}" + (f" by {x_column}" if x_column != col else ""),
            "data": box_data,
            "config": {
                "xAxisKey": "category",
                "series": [{"dataKey": "median", "color": colors[3], "type": "boxPlot"}],
            },
        }

    if chart_type == "heatmap":
        # Build a correlation matrix or cross-tab
        if len(valid_y) >= 2:
            # Correlation matrix between numeric columns
            num_cols = [c for c in valid_y if pd.api.types.is_numeric_dtype(result[c])]
            if len(num_cols) >= 2:
                corr_df = pd.DataFrame(result.loc[:, num_cols])
                corr = corr_df.corr().round(2)
                heatmap_data = []
                for row_name in corr.index:
                    for col_name in corr.columns:
                        heatmap_data.append({
                            "x": str(col_name),
                            "y": str(row_name),
                            "value": float(corr.loc[row_name, col_name]),
                        })
                return {
                    "chart_type": "heatmap",
                    "title": "Correlation Heatmap",
                    "data": heatmap_data,
                    "config": {
                        "xAxisKey": "x",
                        "series": [{"dataKey": "value", "color": colors[0], "type": "heatmap"}],
                    },
                }
        # Fallback: cross-tab of x_column vs first y_column
        cross = pd.crosstab(result[x_column], result[valid_y[0]]).head(15)
        cross = cross.iloc[:, :15]
        heatmap_data = []
        for row_name in cross.index:
            for col_name in cross.columns:
                heatmap_data.append({
                    "x": str(col_name),
                    "y": str(row_name),
                    "value": int(cross.loc[row_name, col_name]),
                })
        return {
            "chart_type": "heatmap",
            "title": f"{valid_y[0]} by {x_column} Heatmap",
            "data": heatmap_data,
            "config": {
                "xAxisKey": "x",
                "series": [{"dataKey": "value", "color": colors[0], "type": "heatmap"}],
            },
        }

    if chart_type == "candlestick":
        # Expects columns for open, high, low, close — map from y_columns or use conventions
        ohlc_keys = ["open", "high", "low", "close"]
        col_map = {}
        # Try to map y_columns to OHLC in order
        for i, key in enumerate(ohlc_keys):
            if i < len(valid_y):
                col_map[key] = valid_y[i]
            else:
                # Try to find columns named open/high/low/close
                matches = [c for c in result.columns if key.lower() in c.lower()]
                col_map[key] = matches[0] if matches else valid_y[0]
        candle_data = []
        for row in result.fillna(0).to_dict("records"):
            candle_data.append({
                "date": str(row.get(x_column, "")),
                "open": round(float(row.get(col_map["open"], 0)), 2),
                "high": round(float(row.get(col_map["high"], 0)), 2),
                "low": round(float(row.get(col_map["low"], 0)), 2),
                "close": round(float(row.get(col_map["close"], 0)), 2),
            })
        return {
            "chart_type": "candlestick",
            "title": title,
            "data": candle_data,
            "config": {
                "xAxisKey": "date",
                "series": [{"dataKey": "close", "color": colors[2], "type": "candlestick"}],
            },
        }

    if chart_type == "scatter":
        y_key = valid_y[0]
        x_series = pd.Series(pd.to_numeric(result[x_column], errors="coerce"), index=result.index)
        if x_series.isna().all():
            try:
                dt_series = pd.Series(pd.to_datetime(result[x_column], errors="coerce"), index=result.index)
                if dt_series.notna().sum() >= 2:
                    x_series = pd.Series(dt_series.astype("int64") / 1e9, index=result.index)
                    result = result.copy()
                    result["_original_x"] = result[x_column]
                    result[x_column] = x_series
            except Exception:
                pass

        y_series = pd.Series(pd.to_numeric(result[y_key], errors="coerce"), index=result.index)
        valid_mask = x_series.notna() & y_series.notna()
        if valid_mask.sum() < 2:
            return {
                "error": (
                    f"Scatter requires numeric x and y. Column '{x_column}' "
                    "could not be converted to numbers."
                )
            }

        scatter_result = result.loc[valid_mask]
        scatter_data = []
        for idx, row in scatter_result.iterrows():
            entry = {
                x_column: round(float(x_series.loc[idx]), 2),
                y_key: round(float(y_series.loc[idx]), 2),
            }
            for col in result.columns:
                if col not in entry and col != "_original_x":
                    val = row[col]
                    entry[col] = val if pd.notna(val) else None
            if "_original_x" in result.columns:
                entry["_original_x"] = str(row["_original_x"])
            scatter_data.append(entry)
        return {
            "chart_type": "scatter",
            "title": title,
            "data": scatter_data,
            "config": {
                "xAxisKey": x_column,
                "series": [{"dataKey": y_key, "color": colors[0], "type": "scatter"}],
            },
        }

    series = [
        {
            "dataKey": col,
            "color": colors[i % len(colors)],
            "type": chart_type if chart_type in ["line", "area"] else "bar",
        }
        for i, col in enumerate(valid_y)
    ]

    chart_config = {
        "chart_type": chart_type,
        "title": title,
        "data": result.fillna(0).to_dict("records"),
        "config": {
            "xAxisKey": x_column,
            "series": series,
        }
    }

    return chart_config


# ---------------------------------------------------------------------------
# Data mutation preview functions.
#
# Each function computes what WOULD change without modifying the DataFrame.
# It returns a preview dict that the frontend displays, and stores a
# "pending mutation" recipe that can be applied later via /api/data/apply.
# ---------------------------------------------------------------------------

def _sample_rows(df: pd.DataFrame, n: int = 5) -> list[dict]:
    """Return up to *n* sample rows as dicts, handling NaN gracefully."""
    sample = df.head(n)
    return sample.fillna("").to_dict("records")


def preview_remove_outliers(
    df: pd.DataFrame,
    column: str,
    method: str = "iqr",
    threshold: float = 1.5,
) -> dict:
    """Preview removing outliers from a numeric column."""
    if column not in df.columns:
        return {"error": f"Column '{column}' not found"}
    if not pd.api.types.is_numeric_dtype(df[column]):
        return {"error": f"Column '{column}' is not numeric"}

    col_data = df[column].dropna()

    if method == "zscore":
        mean = col_data.mean()
        std = col_data.std()
        if std == 0:
            return {"error": f"Column '{column}' has zero variance — no outliers to detect"}
        z_scores = ((df[column] - mean) / std).abs()
        outlier_mask = z_scores > threshold
        detail_info = {"mean": round(float(mean), 2), "std": round(float(std), 2),
                       "threshold": threshold}
    else:  # iqr
        q1 = col_data.quantile(0.25)
        q3 = col_data.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - threshold * iqr
        upper = q3 + threshold * iqr
        outlier_mask = (df[column] < lower) | (df[column] > upper)
        detail_info = {"q1": round(float(q1), 2), "q3": round(float(q3), 2),
                       "iqr": round(float(iqr), 2),
                       "lower_bound": round(float(lower), 2),
                       "upper_bound": round(float(upper), 2),
                       "threshold": threshold}

    rows_affected = int(outlier_mask.sum())
    if rows_affected == 0:
        return {"error": f"No outliers found in '{column}' with {method} method (threshold={threshold})"}

    df_after = cast(pd.DataFrame, df.loc[~outlier_mask])
    preview_id = str(uuid.uuid4())[:12]

    return {
        "preview_id": preview_id,
        "action": "remove_outliers",
        "description": f"Remove {rows_affected} outlier rows from '{column}' using {method.upper()} method",
        "rows_before": len(df),
        "rows_after": len(df_after),
        "rows_affected": rows_affected,
        "columns_affected": [column],
        "sample_before": _sample_rows(cast(pd.DataFrame, df.loc[outlier_mask])),
        "sample_after": _sample_rows(df_after),
        "details": {**detail_info, "method": method, "column": column},
        "_mutation_args": {"column": column, "method": method, "threshold": threshold},
    }


def preview_fill_missing(
    df: pd.DataFrame,
    column: str,
    strategy: str = "mean",
    fill_value: Optional[str] = None,
) -> dict:
    """Preview filling missing values in a column."""
    if column not in df.columns:
        return {"error": f"Column '{column}' not found"}

    null_count = int(df[column].isna().sum())
    if null_count == 0:
        return {"error": f"Column '{column}' has no missing values"}

    df_copy = df.copy()
    is_numeric = pd.api.types.is_numeric_dtype(df[column])

    if strategy == "mean":
        if not is_numeric:
            return {"error": f"Cannot use 'mean' strategy on non-numeric column '{column}'"}
        fill = df[column].mean()
        desc_val = f"mean ({round(float(fill), 2)})"
    elif strategy == "median":
        if not is_numeric:
            return {"error": f"Cannot use 'median' strategy on non-numeric column '{column}'"}
        fill = df[column].median()
        desc_val = f"median ({round(float(fill), 2)})"
    elif strategy == "mode":
        mode_vals = df[column].mode()
        if len(mode_vals) == 0:
            return {"error": f"Cannot compute mode for column '{column}'"}
        fill = mode_vals.iloc[0]
        desc_val = f"mode ({fill})"
    elif strategy == "value":
        if fill_value is None:
            return {"error": "fill_value is required when strategy='value'"}
        fill = float(fill_value) if is_numeric else fill_value
        desc_val = f"value '{fill}'"
    else:
        return {"error": f"Unknown strategy: {strategy}"}

    # Get sample of affected rows before filling
    affected_mask = df[column].isna()
    sample_before = _sample_rows(cast(pd.DataFrame, df.loc[affected_mask]))

    df_copy[column] = df_copy[column].fillna(fill)
    sample_after = _sample_rows(cast(pd.DataFrame, df_copy.loc[affected_mask]))

    preview_id = str(uuid.uuid4())[:12]
    return {
        "preview_id": preview_id,
        "action": "fill_missing",
        "description": f"Fill {null_count} missing values in '{column}' with {desc_val}",
        "rows_before": len(df),
        "rows_after": len(df),
        "rows_affected": null_count,
        "columns_affected": [column],
        "sample_before": sample_before,
        "sample_after": sample_after,
        "details": {"column": column, "strategy": strategy, "fill_value": str(fill),
                     "null_count": null_count},
        "_mutation_args": {"column": column, "strategy": strategy, "fill_value": fill_value},
    }


def preview_drop_columns(
    df: pd.DataFrame,
    columns: list[str],
) -> dict:
    """Preview dropping one or more columns."""
    valid = [c for c in columns if c in df.columns]
    if not valid:
        return {"error": f"None of the columns {columns} exist in the dataset"}

    df_after = df.drop(columns=valid)
    preview_id = str(uuid.uuid4())[:12]

    return {
        "preview_id": preview_id,
        "action": "drop_columns",
        "description": f"Drop {len(valid)} column(s): {', '.join(valid)}",
        "rows_before": len(df),
        "rows_after": len(df),
        "rows_affected": len(df),
        "columns_affected": valid,
        "sample_before": _sample_rows(cast(pd.DataFrame, df[valid])),
        "sample_after": [],
        "details": {"dropped_columns": valid,
                     "columns_before": len(df.columns),
                     "columns_after": len(df_after.columns)},
        "_mutation_args": {"columns": valid},
    }


def preview_filter_rows(
    df: pd.DataFrame,
    column: str,
    operator: str,
    value: str,
) -> dict:
    """Preview filtering (keeping) rows that match a condition."""
    if column not in df.columns:
        return {"error": f"Column '{column}' not found"}

    # Build the keep-mask using _apply_filters logic
    keep_mask = pd.Series(True, index=df.index)
    is_numeric = pd.api.types.is_numeric_dtype(df[column])

    try:
        cmp_val: object = float(value) if is_numeric else value
    except (ValueError, TypeError):
        cmp_val = value

    if operator == "==":
        keep_mask = df[column] == cmp_val
    elif operator == "!=":
        keep_mask = df[column] != cmp_val
    elif operator == ">":
        keep_mask = df[column] > float(value)
    elif operator == "<":
        keep_mask = df[column] < float(value)
    elif operator == ">=":
        keep_mask = df[column] >= float(value)
    elif operator == "<=":
        keep_mask = df[column] <= float(value)
    elif operator == "contains":
        keep_mask = df[column].astype(str).str.contains(str(value), case=False, na=False)
    elif operator == "not_contains":
        keep_mask = ~df[column].astype(str).str.contains(str(value), case=False, na=False)
    else:
        return {"error": f"Unknown operator: {operator}"}

    rows_removed = int((~keep_mask).sum())
    if rows_removed == 0:
        return {"error": f"No rows would be removed by this filter"}

    df_after = cast(pd.DataFrame, df.loc[keep_mask])
    preview_id = str(uuid.uuid4())[:12]

    return {
        "preview_id": preview_id,
        "action": "filter_rows",
        "description": f"Keep rows where {column} {operator} {value} (remove {rows_removed} rows)",
        "rows_before": len(df),
        "rows_after": len(df_after),
        "rows_affected": rows_removed,
        "columns_affected": [column],
        "sample_before": _sample_rows(cast(pd.DataFrame, df.loc[~keep_mask])),
        "sample_after": _sample_rows(df_after),
        "details": {"column": column, "operator": operator, "value": value,
                     "rows_kept": len(df_after), "rows_removed": rows_removed},
        "_mutation_args": {"column": column, "operator": operator, "value": value},
    }


def preview_rename_columns(
    df: pd.DataFrame,
    rename_map: dict[str, str],
) -> dict:
    """Preview renaming columns."""
    valid_renames = {old: new for old, new in rename_map.items() if old in df.columns}
    if not valid_renames:
        return {"error": f"None of the columns to rename exist in the dataset"}

    df_after = df.rename(columns=valid_renames)
    preview_id = str(uuid.uuid4())[:12]

    return {
        "preview_id": preview_id,
        "action": "rename_columns",
        "description": f"Rename {len(valid_renames)} column(s): " +
                       ", ".join(f"'{old}' → '{new}'" for old, new in valid_renames.items()),
        "rows_before": len(df),
        "rows_after": len(df),
        "rows_affected": 0,
        "columns_affected": list(valid_renames.keys()),
        "sample_before": [{"old_name": old, "new_name": new} for old, new in valid_renames.items()],
        "sample_after": [],
        "details": {"rename_map": valid_renames},
        "_mutation_args": {"rename_map": valid_renames},
    }


def preview_change_dtype(
    df: pd.DataFrame,
    column: str,
    new_dtype: str,
) -> dict:
    """Preview changing a column's data type."""
    if column not in df.columns:
        return {"error": f"Column '{column}' not found"}

    old_dtype = str(df[column].dtype)
    allowed = {"int64", "float64", "str", "bool", "datetime64", "category"}
    if new_dtype not in allowed:
        return {"error": f"Unsupported dtype '{new_dtype}'. Allowed: {', '.join(sorted(allowed))}"}

    try:
        converted: pd.Series
        if new_dtype == "datetime64":
            converted = cast(pd.Series, pd.to_datetime(df[column], errors="coerce"))
        elif new_dtype == "category":
            converted = cast(pd.Series, df[column].astype("category"))
        elif new_dtype == "str":
            converted = cast(pd.Series, df[column].astype(str))
        elif new_dtype == "bool":
            converted = cast(pd.Series, df[column].astype(bool))
        else:
            converted = cast(
                pd.Series,
                pd.to_numeric(df[column], errors="coerce")
                if new_dtype in ("int64", "float64")
                else df[column].astype(new_dtype),
            )
            if new_dtype == "int64":
                converted = cast(pd.Series, converted.astype("Int64"))  # nullable int
    except Exception as e:
        return {"error": f"Cannot convert '{column}' to {new_dtype}: {str(e)}"}

    coerced_nulls = int(pd.Series(converted).isna().sum() - df[column].isna().sum())
    preview_id = str(uuid.uuid4())[:12]

    return {
        "preview_id": preview_id,
        "action": "change_dtype",
        "description": f"Change '{column}' from {old_dtype} to {new_dtype}" +
                       (f" ({coerced_nulls} values will become null)" if coerced_nulls > 0 else ""),
        "rows_before": len(df),
        "rows_after": len(df),
        "rows_affected": coerced_nulls if coerced_nulls > 0 else len(df),
        "columns_affected": [column],
        "sample_before": _sample_rows(cast(pd.DataFrame, df.loc[:, [column]])),
        "sample_after": [{"column": column, "old_dtype": old_dtype, "new_dtype": new_dtype}],
        "details": {"column": column, "old_dtype": old_dtype, "new_dtype": new_dtype,
                     "coerced_nulls": coerced_nulls},
        "_mutation_args": {"column": column, "new_dtype": new_dtype},
    }


def preview_remove_duplicates(
    df: pd.DataFrame,
    subset: Optional[list[str]] = None,
) -> dict:
    """Preview removing duplicate rows."""
    if subset:
        valid_subset = [c for c in subset if c in df.columns]
        if not valid_subset:
            return {"error": f"None of the subset columns {subset} exist in the dataset"}
        dup_mask = df.duplicated(subset=valid_subset, keep="first")
        subset_desc = f" based on columns: {', '.join(valid_subset)}"
    else:
        dup_mask = df.duplicated(keep="first")
        valid_subset = None
        subset_desc = ""

    dup_count = int(dup_mask.sum())
    if dup_count == 0:
        return {"error": f"No duplicate rows found{subset_desc}"}

    df_after = cast(pd.DataFrame, df.loc[~dup_mask])
    preview_id = str(uuid.uuid4())[:12]

    return {
        "preview_id": preview_id,
        "action": "remove_duplicates",
        "description": f"Remove {dup_count} duplicate rows{subset_desc}",
        "rows_before": len(df),
        "rows_after": len(df_after),
        "rows_affected": dup_count,
        "columns_affected": valid_subset or df.columns.tolist(),
        "sample_before": _sample_rows(cast(pd.DataFrame, df.loc[dup_mask])),
        "sample_after": _sample_rows(df_after),
        "details": {"duplicate_count": dup_count, "subset": valid_subset},
        "_mutation_args": {"subset": valid_subset},
    }


# ---------------------------------------------------------------------------
# Apply a confirmed mutation to the actual DataFrame.
#
# Called by /api/data/apply after the user confirms the preview.
# Returns the new DataFrame and a human-readable description.
# ---------------------------------------------------------------------------

def apply_mutation(df: pd.DataFrame, action: str, args: dict) -> tuple[pd.DataFrame, str]:
    """Apply a confirmed mutation. Returns (new_df, description_str)."""
    if action == "remove_outliers":
        col = args["column"]
        method = args.get("method", "iqr")
        threshold = args.get("threshold", 1.5)
        col_data = df[col].dropna()
        if method == "zscore":
            mean, std = col_data.mean(), col_data.std()
            z = ((df[col] - mean) / std).abs()
            mask = z <= threshold
        else:
            q1, q3 = col_data.quantile(0.25), col_data.quantile(0.75)
            iqr = q3 - q1
            mask = (df[col] >= q1 - threshold * iqr) & (df[col] <= q3 + threshold * iqr)
        new_df = cast(pd.DataFrame, df.loc[mask]).reset_index(drop=True)
        return new_df, f"Removed outliers from '{col}' ({len(df) - len(new_df)} rows removed)"

    elif action == "fill_missing":
        col = args["column"]
        strategy = args.get("strategy", "mean")
        new_df = df.copy()
        if strategy == "mean":
            fill = df[col].mean()
        elif strategy == "median":
            fill = df[col].median()
        elif strategy == "mode":
            fill = df[col].mode().iloc[0]
        else:  # value
            is_numeric = pd.api.types.is_numeric_dtype(df[col])
            fill = float(args["fill_value"]) if is_numeric else args["fill_value"]
        nulls = int(new_df[col].isna().sum())
        new_df[col] = new_df[col].fillna(fill)
        return new_df, f"Filled {nulls} missing values in '{col}' with {strategy}"

    elif action == "drop_columns":
        cols = args["columns"]
        new_df = df.drop(columns=cols)
        return new_df, f"Dropped columns: {', '.join(cols)}"

    elif action == "filter_rows":
        col, op, val = args["column"], args["operator"], args["value"]
        # Re-use _apply_filters
        new_df = _apply_filters(df, [{"column": col, "operator": op, "value": val}])
        new_df = new_df.reset_index(drop=True)
        return new_df, f"Filtered rows: {col} {op} {val} ({len(df) - len(new_df)} rows removed)"

    elif action == "rename_columns":
        rename_map = args["rename_map"]
        new_df = df.rename(columns=rename_map)
        return new_df, f"Renamed columns: {rename_map}"

    elif action == "change_dtype":
        col, new_dtype = args["column"], args["new_dtype"]
        new_df = df.copy()
        if new_dtype == "datetime64":
            new_df[col] = pd.to_datetime(new_df[col], errors="coerce")
        elif new_dtype == "category":
            new_df[col] = new_df[col].astype("category")
        elif new_dtype == "str":
            new_df[col] = new_df[col].astype(str)
        elif new_dtype == "bool":
            new_df[col] = new_df[col].astype(bool)
        else:
            new_df[col] = pd.to_numeric(new_df[col], errors="coerce")
            if new_dtype == "int64":
                new_df[col] = new_df[col].astype("Int64")
        return new_df, f"Changed '{col}' dtype to {new_dtype}"

    elif action == "remove_duplicates":
        subset = args.get("subset")
        new_df = df.drop_duplicates(subset=subset, keep="first").reset_index(drop=True)
        return new_df, f"Removed {len(df) - len(new_df)} duplicate rows"

    else:
        raise ValueError(f"Unknown mutation action: {action}")


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
                        "description": "How to aggregate grouped values. One of: sum, mean, count, min, max, median. Omit if not grouping."
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
                        "enum": ["bar", "line", "pie", "area", "scatter", "composed", "treemap", "funnel", "radar", "radialBar", "histogram", "groupedBar", "stackedBar", "donut", "bubble", "waterfall", "boxPlot", "heatmap", "candlestick"],
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
                        "description": "How to aggregate if grouping. One of: sum, mean, count, min, max. Omit if no aggregation needed."
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
    },
    {
        "type": "function",
        "function": {
            "name": "create_table",
            "description": "Create a data table to display on the dashboard. Use this whenever the user asks to see a table, list, summary table, comparison table, or tabular view of data. Generates the table data and column configuration for rendering as an interactive table on the dashboard.",
            "parameters": {
                "type": "object",
                "properties": {
                    "columns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Which columns to include in the table"
                    },
                    "group_by": {"type": "string", "description": "Column to group and aggregate by (e.g. 'company', 'region')"},
                    "aggregation": {
                        "type": "string",
                        "enum": ["sum", "mean", "count", "min", "max", "median"],
                        "description": "How to aggregate values when grouping"
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
                        "description": "Filters to apply before building the table"
                    },
                    "sort_by": {"type": "string", "description": "Column to sort by"},
                    "sort_ascending": {"type": "boolean", "description": "Sort ascending (true) or descending (false)"},
                    "limit": {"type": "integer", "description": "Max rows to return (default 20)"},
                    "title": {"type": "string", "description": "Title for the table"}
                }
            }
        }
    },
    # --- Data mutation tools (agent mode) ---
    {
        "type": "function",
        "function": {
            "name": "remove_outliers",
            "description": "Preview removing statistical outliers from a numeric column. Returns a preview of what would change — the user must confirm before changes are applied. Use when the user asks to 'remove outliers', 'clean outliers', or 'filter extreme values'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "column": {"type": "string", "description": "Numeric column to check for outliers"},
                    "method": {"type": "string", "enum": ["iqr", "zscore"], "description": "Detection method: 'iqr' (default, uses interquartile range) or 'zscore'"},
                    "threshold": {"type": "number", "description": "IQR multiplier (default 1.5) or Z-score threshold (default 3)"}
                },
                "required": ["column"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fill_missing",
            "description": "Preview filling missing/null values in a column. Returns a preview — user must confirm. Use when the user asks to 'fill missing values', 'handle nulls', 'impute', or 'replace NaN'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "column": {"type": "string", "description": "Column with missing values to fill"},
                    "strategy": {"type": "string", "enum": ["mean", "median", "mode", "value"], "description": "Fill strategy: mean/median (numeric only), mode (most common value), or value (custom)"},
                    "fill_value": {"type": "string", "description": "Custom value to fill with (required when strategy='value')"}
                },
                "required": ["column"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "drop_columns",
            "description": "Preview dropping/removing one or more columns from the dataset. Returns a preview — user must confirm. Use when the user asks to 'drop column', 'remove column', or 'delete column'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "columns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of column names to drop"
                    }
                },
                "required": ["columns"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "filter_rows",
            "description": "Preview filtering rows by a condition (keeps matching rows, removes the rest). Returns a preview — user must confirm. Use when the user asks to 'filter rows', 'keep only', 'remove rows where', or 'exclude'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "column": {"type": "string", "description": "Column to filter on"},
                    "operator": {"type": "string", "enum": ["==", "!=", ">", "<", ">=", "<=", "contains", "not_contains"], "description": "Comparison operator"},
                    "value": {"type": "string", "description": "Value to compare against"}
                },
                "required": ["column", "operator", "value"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "rename_columns",
            "description": "Preview renaming one or more columns. Returns a preview — user must confirm. Use when the user asks to 'rename column', 'change column name', or 'relabel'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "rename_map": {
                        "type": "object",
                        "description": "Mapping of old column names to new names, e.g. {\"old_name\": \"new_name\"}"
                    }
                },
                "required": ["rename_map"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "change_dtype",
            "description": "Preview changing a column's data type. Returns a preview — user must confirm. Use when the user asks to 'change type', 'convert column', or 'cast to'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "column": {"type": "string", "description": "Column to change type of"},
                    "new_dtype": {"type": "string", "enum": ["int64", "float64", "str", "bool", "datetime64", "category"], "description": "Target data type"}
                },
                "required": ["column", "new_dtype"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remove_duplicates",
            "description": "Preview removing duplicate rows. Returns a preview — user must confirm. Use when the user asks to 'remove duplicates', 'deduplicate', or 'drop duplicate rows'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "subset": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Columns to check for duplicates (all columns if not specified)"
                    }
                }
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
    elif tool_name == "create_table":
        return create_table_data(df, **arguments)
    elif tool_name == "compute_stats":
        return compute_stats(df, **arguments)
    elif tool_name == "detect_patterns":
        return detect_patterns(df, **arguments)
    # --- Data mutation tools ---
    elif tool_name == "remove_outliers":
        return preview_remove_outliers(df, **arguments)
    elif tool_name == "fill_missing":
        return preview_fill_missing(df, **arguments)
    elif tool_name == "drop_columns":
        return preview_drop_columns(df, **arguments)
    elif tool_name == "filter_rows":
        return preview_filter_rows(df, **arguments)
    elif tool_name == "rename_columns":
        return preview_rename_columns(df, **arguments)
    elif tool_name == "change_dtype":
        return preview_change_dtype(df, **arguments)
    elif tool_name == "remove_duplicates":
        return preview_remove_duplicates(df, **arguments)
    else:
        return {"error": f"Unknown tool: {tool_name}"}

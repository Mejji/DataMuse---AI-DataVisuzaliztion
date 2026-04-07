import json
import pandas as pd
from app.models.schemas import ColumnProfile, DatasetProfile


def _classify_column(series: pd.Series, row_count: int, col_name: str = "") -> str:
    """Classify a column into a semantic type for smart visualization filtering."""

    # Numeric columns
    if pd.api.types.is_numeric_dtype(series):
        unique = series.nunique()
        # ID-like: nearly all unique integers AND (name looks like an ID OR values are
        # small sequential-ish integers). Revenue/budget columns with large values are NOT IDs.
        if unique >= row_count * 0.9 and pd.api.types.is_integer_dtype(series):
            name_lower = col_name.lower().strip()
            name_is_id = any(tok in name_lower for tok in ["id", "index", "idx", "_id", "key"])
            # Check if values look sequential (small range relative to count)
            val_range = series.max() - series.min()
            looks_sequential = val_range < row_count * 10
            if name_is_id or looks_sequential:
                return "id"
        return "numeric"

    # Datetime columns
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"

    # For object/string columns, inspect actual values
    sample = series.dropna().head(50)
    if len(sample) == 0:
        return "categorical"

    # Check for JSON nested data (arrays or objects)
    json_count = 0
    for val in sample:
        s = str(val).strip()
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, (list, dict)):
                    json_count += 1
            except (json.JSONDecodeError, ValueError):
                pass
    if json_count >= len(sample) * 0.5:
        return "json_nested"

    # Check for long text (descriptions, overviews, URLs blob)
    avg_len = sample.astype(str).str.len().mean()
    if avg_len > 100:
        return "long_text"

    # Check if it looks like a date string that pandas didn't auto-parse
    if series.nunique() > 10:
        date_sample = sample.head(10)
        date_hits = 0
        for val in date_sample:
            s = str(val).strip()
            # Common date patterns: YYYY-MM-DD, MM/DD/YYYY, etc.
            if len(s) >= 8 and any(sep in s for sep in ["-", "/"]):
                try:
                    pd.to_datetime(s)
                    date_hits += 1
                except (ValueError, TypeError):
                    pass
        if date_hits >= len(date_sample) * 0.7:
            return "datetime"

    return "categorical"


def profile_csv(df: pd.DataFrame, filename: str) -> DatasetProfile:
    columns = []
    row_count = len(df)

    for col in df.columns:
        series: pd.Series = df[col]  # type: ignore[assignment]
        col_class = _classify_column(series, row_count, col_name=str(col))

        profile = ColumnProfile(
            name=col,
            dtype=str(df[col].dtype),
            non_null_count=int(df[col].notna().sum()),
            null_count=int(df[col].isna().sum()),
            unique_count=int(df[col].nunique()),
            sample_values=df[col].dropna().head(5).tolist(),
            column_class=col_class,
        )

        if pd.api.types.is_numeric_dtype(df[col]):
            profile.mean = round(float(df[col].mean()), 2) if df[col].notna().any() else None
            profile.median = round(float(df[col].median()), 2) if df[col].notna().any() else None
            profile.min_val = round(float(df[col].min()), 2) if df[col].notna().any() else None
            profile.max_val = round(float(df[col].max()), 2) if df[col].notna().any() else None
            profile.std = round(float(df[col].std()), 2) if df[col].notna().any() else None
        else:
            # For JSON nested columns, truncate top_values keys to avoid giant JSON blobs
            if col_class == "json_nested":
                profile.top_values = {"[JSON array/object data]": int(df[col].notna().sum())}
            else:
                top = df[col].value_counts().head(5).to_dict()
                profile.top_values = {str(k): int(v) for k, v in top.items()}

        columns.append(profile)

    sample_rows = df.head(5).fillna("").to_dict(orient="records")

    return DatasetProfile(
        filename=filename,
        row_count=len(df),
        column_count=len(df.columns),
        columns=columns,
        sample_rows=sample_rows,
        summary=""  # Will be filled by AI later
    )

import pandas as pd
from app.models.schemas import ColumnProfile, DatasetProfile


def profile_csv(df: pd.DataFrame, filename: str) -> DatasetProfile:
    columns = []

    for col in df.columns:
        profile = ColumnProfile(
            name=col,
            dtype=str(df[col].dtype),
            non_null_count=int(df[col].notna().sum()),
            null_count=int(df[col].isna().sum()),
            unique_count=int(df[col].nunique()),
            sample_values=df[col].dropna().head(5).tolist(),
        )

        if pd.api.types.is_numeric_dtype(df[col]):
            profile.mean = round(float(df[col].mean()), 2) if df[col].notna().any() else None
            profile.median = round(float(df[col].median()), 2) if df[col].notna().any() else None
            profile.min_val = round(float(df[col].min()), 2) if df[col].notna().any() else None
            profile.max_val = round(float(df[col].max()), 2) if df[col].notna().any() else None
            profile.std = round(float(df[col].std()), 2) if df[col].notna().any() else None
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

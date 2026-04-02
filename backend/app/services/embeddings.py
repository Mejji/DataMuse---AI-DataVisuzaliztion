from sentence_transformers import SentenceTransformer
import pandas as pd
from qdrant_client.models import PointStruct
from app.services.qdrant_service import ensure_collection, upsert_points

model = SentenceTransformer("all-MiniLM-L6-v2")


def embed_text(text: str) -> list[float]:
    """Generate embedding for a single text."""
    return model.encode(text).tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts."""
    return model.encode(texts).tolist()


def create_dataset_chunks(df: pd.DataFrame, filename: str) -> list[dict]:
    """Create text chunks from a DataFrame for embedding.

    Strategy:
    1. Column metadata descriptions
    2. Statistical summaries per numeric column
    3. Category distributions for categorical columns
    4. Row-group summaries (sample narrative descriptions)
    """
    chunks = []

    # 1. Overall dataset description
    col_names = ", ".join(df.columns.tolist())
    chunks.append({
        "text": f"This dataset '{filename}' has {len(df)} rows and {len(df.columns)} columns. "
                f"The columns are: {col_names}.",
        "chunk_type": "overview",
        "source": "metadata",
    })

    # 2. Per-column descriptions
    for col in df.columns:
        dtype = str(df[col].dtype)
        non_null = df[col].notna().sum()

        if pd.api.types.is_numeric_dtype(df[col]):
            desc = (
                f"Column '{col}' is numeric ({dtype}). "
                f"It has {non_null} non-null values. "
                f"Range: {df[col].min():.2f} to {df[col].max():.2f}. "
                f"Average: {df[col].mean():.2f}, Median: {df[col].median():.2f}. "
                f"Standard deviation: {df[col].std():.2f}."
            )
        else:
            unique = df[col].nunique()
            top_vals = df[col].value_counts().head(5)
            top_str = ", ".join([f"'{k}' ({v} times)" for k, v in top_vals.items()])
            desc = (
                f"Column '{col}' is categorical ({dtype}). "
                f"It has {unique} unique values and {non_null} non-null entries. "
                f"Most common values: {top_str}."
            )

        chunks.append({
            "text": desc,
            "chunk_type": "column",
            "source": col,
        })

    # 3. Correlation insights for numeric columns
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    if len(numeric_cols) >= 2:
        corr = df[numeric_cols].corr()
        for i, col1 in enumerate(numeric_cols):
            for col2 in numeric_cols[i + 1:]:
                r = corr.loc[col1, col2]
                if abs(r) > 0.5:
                    strength = "strongly" if abs(r) > 0.7 else "moderately"
                    direction = "positively" if r > 0 else "negatively"
                    chunks.append({
                        "text": f"Columns '{col1}' and '{col2}' are {strength} {direction} correlated (r={r:.2f}). "
                                f"When '{col1}' goes up, '{col2}' tends to go {'up' if r > 0 else 'down'}.",
                        "chunk_type": "correlation",
                        "source": f"{col1}+{col2}",
                    })

    # 4. Sample row narratives (first 20 rows, batched in groups of 5)
    sample = df.head(20)
    for i in range(0, len(sample), 5):
        batch = sample.iloc[i:i+5]
        rows_text = []
        for _, row in batch.iterrows():
            row_str = ", ".join([f"{col}: {row[col]}" for col in df.columns])
            rows_text.append(row_str)
        chunks.append({
            "text": f"Sample data rows {i+1}-{min(i+5, len(sample))}: " + " | ".join(rows_text),
            "chunk_type": "sample_rows",
            "source": f"rows_{i+1}_{min(i+5, len(sample))}",
        })

    return chunks


def ingest_dataset(df: pd.DataFrame, dataset_id: str, filename: str):
    """Process a dataset and store embeddings in Qdrant."""
    collection_name = f"dataset_{dataset_id}"
    ensure_collection(collection_name, vector_size=384)

    chunks = create_dataset_chunks(df, filename)
    texts = [c["text"] for c in chunks]
    vectors = embed_texts(texts)

    points = [
        PointStruct(
            id=idx,
            vector=vec,
            payload={
                "text": chunk["text"],
                "chunk_type": chunk["chunk_type"],
                "source": chunk["source"],
                "dataset_id": dataset_id,
            }
        )
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]

    upsert_points(collection_name, points)
    return len(points)

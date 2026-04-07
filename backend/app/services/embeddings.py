import gc
from sentence_transformers import SentenceTransformer
import pandas as pd
import numpy as np
from qdrant_client.models import PointStruct
from app.services.qdrant_service import ensure_collection, upsert_points

# ---------------------------------------------------------------------------
# Lazy-loaded model — only initialised on first call to embed_text/embed_texts.
# SentenceTransformer loads ~400 MB into RAM, so deferring it avoids paying
# that cost at import time (e.g. during type checking or test collection).
# ---------------------------------------------------------------------------
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def embed_text(text: str) -> list[float]:
    """Generate embedding for a single text."""
    return _get_model().encode(text).tolist()


# Maximum texts to encode in a single batch.  Keeps peak memory bounded
# even when a 40k-row dataset generates hundreds of chunks.
_ENCODE_BATCH_SIZE = 32


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts in memory-safe batches.

    Instead of encoding *all* texts at once (which allocates one giant
    float matrix), we process ``_ENCODE_BATCH_SIZE`` texts at a time and
    concatenate the results.  Between batches we hint the GC to reclaim
    intermediary numpy arrays.
    """
    model = _get_model()
    if len(texts) <= _ENCODE_BATCH_SIZE:
        return model.encode(texts).tolist()

    all_vectors: list[list[float]] = []
    for i in range(0, len(texts), _ENCODE_BATCH_SIZE):
        batch = texts[i : i + _ENCODE_BATCH_SIZE]
        vectors = model.encode(batch).tolist()
        all_vectors.extend(vectors)
        # Free intermediary numpy arrays between batches
        if i + _ENCODE_BATCH_SIZE < len(texts):
            gc.collect()
    return all_vectors


def create_dataset_chunks(df: pd.DataFrame, filename: str) -> list[dict]:
    """Create text chunks from a DataFrame for embedding.

    Strategy (optimised for large datasets 10k+ rows):
    1. Column metadata descriptions
    2. Statistical summaries per numeric column
    3. Category distributions for categorical columns
    4. Per-category aggregate summaries (leverages Qdrant for fast lookup)
    5. Stratified row samples across the dataset (not just head)
    6. Cross-column relationships and distribution bins
    """
    chunks = []
    n_rows = len(df)

    # ------------------------------------------------------------------
    # 1. Overall dataset description
    # ------------------------------------------------------------------
    col_names = ", ".join(df.columns.tolist())
    chunks.append({
        "text": f"This dataset '{filename}' has {n_rows:,} rows and {len(df.columns)} columns. "
                f"The columns are: {col_names}.",
        "chunk_type": "overview",
        "source": "metadata",
    })

    # ------------------------------------------------------------------
    # 2. Per-column descriptions (with richer stats for large datasets)
    # ------------------------------------------------------------------
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    categorical_cols = [c for c in df.columns if c not in numeric_cols]

    for col in df.columns:
        dtype = str(df[col].dtype)
        non_null = df[col].notna().sum()

        if col in numeric_cols:
            desc = (
                f"Column '{col}' is numeric ({dtype}). "
                f"It has {non_null:,} non-null values out of {n_rows:,} rows. "
                f"Range: {df[col].min():.2f} to {df[col].max():.2f}. "
                f"Average: {df[col].mean():.2f}, Median: {df[col].median():.2f}. "
                f"Standard deviation: {df[col].std():.2f}. "
                f"25th percentile: {df[col].quantile(0.25):.2f}, "
                f"75th percentile: {df[col].quantile(0.75):.2f}."
            )
        else:
            unique = df[col].nunique()
            top_vals = df[col].value_counts().head(10)
            top_str = ", ".join([f"'{k}' ({v:,} times)" for k, v in top_vals.items()])
            bottom_vals = df[col].value_counts().tail(3)
            bottom_str = ", ".join([f"'{k}' ({v:,} times)" for k, v in bottom_vals.items()])
            desc = (
                f"Column '{col}' is categorical ({dtype}). "
                f"It has {unique:,} unique values and {non_null:,} non-null entries. "
                f"Most common values: {top_str}. "
                f"Least common values: {bottom_str}."
            )

        chunks.append({
            "text": desc,
            "chunk_type": "column",
            "source": col,
        })

    # ------------------------------------------------------------------
    # 3. Correlation insights for numeric columns
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # 4. Per-category aggregate summaries (KEY for large datasets)
    #    This lets Qdrant return pre-computed aggregates so the LLM knows
    #    what values exist per category without scanning 40k rows.
    # ------------------------------------------------------------------
    for cat_col in categorical_cols:
        n_unique = df[cat_col].nunique()
        if n_unique < 1 or n_unique > 200:
            continue  # skip ID-like columns or columns with too many unique values

        for num_col in numeric_cols[:5]:  # limit to first 5 numeric cols
            try:
                agg = df.groupby(cat_col)[num_col].agg(["sum", "mean", "count", "min", "max"])
                agg = agg.sort_values("sum", ascending=False)

                # Top categories
                top_n = min(15, len(agg))
                top = agg.head(top_n)
                lines = []
                for cat_val, row in top.iterrows():
                    lines.append(
                        f"  {cat_val}: total={row['sum']:.2f}, avg={row['mean']:.2f}, "
                        f"count={int(row['count'])}, min={row['min']:.2f}, max={row['max']:.2f}"
                    )
                text = (
                    f"Aggregated '{num_col}' by '{cat_col}' "
                    f"(top {top_n} of {n_unique} categories):\n" + "\n".join(lines)
                )
                chunks.append({
                    "text": text,
                    "chunk_type": "category_aggregate",
                    "source": f"{cat_col}:{num_col}",
                })
            except Exception:
                continue

    # ------------------------------------------------------------------
    # 5. Distribution bins for numeric columns
    # ------------------------------------------------------------------
    for num_col in numeric_cols[:8]:
        try:
            hist, edges = np.histogram(df[num_col].dropna(), bins=10)
            bin_lines = []
            for i in range(len(hist)):
                bin_lines.append(f"  {edges[i]:.2f} to {edges[i+1]:.2f}: {int(hist[i]):,} rows")
            text = (
                f"Distribution of '{num_col}' across {n_rows:,} rows (10 bins):\n"
                + "\n".join(bin_lines)
            )
            chunks.append({
                "text": text,
                "chunk_type": "distribution",
                "source": num_col,
            })
        except Exception:
            continue

    # ------------------------------------------------------------------
    # 6. Stratified row samples across the dataset
    #    Instead of just head(20), sample from beginning, middle, and end
    #    and random positions for better representation.
    # ------------------------------------------------------------------
    sample_size = min(50, n_rows)
    if n_rows <= 50:
        sample = df
    else:
        # Take rows from strategic positions: head, tail, and random
        head_rows = df.head(10)
        tail_rows = df.tail(10)
        mid_start = max(0, n_rows // 2 - 5)
        mid_rows = df.iloc[mid_start:mid_start + 10]
        # Random sample of 20 from remaining
        remaining_indices = set(range(n_rows)) - set(range(10)) - set(range(mid_start, mid_start + 10)) - set(range(n_rows - 10, n_rows))
        if remaining_indices:
            random_n = min(20, len(remaining_indices))
            rng = np.random.default_rng(42)
            random_idx = rng.choice(list(remaining_indices), size=random_n, replace=False)
            random_rows = df.iloc[sorted(random_idx)]
        else:
            random_rows = pd.DataFrame()
        sample = pd.concat([head_rows, mid_rows, tail_rows, random_rows]).drop_duplicates()

    # Batch into groups of 5 for embedding
    for i in range(0, len(sample), 5):
        batch = sample.iloc[i:i + 5]
        rows_text = []
        for _, row in batch.iterrows():
            row_str = ", ".join([f"{col}: {row[col]}" for col in df.columns])
            rows_text.append(row_str)
        position = "beginning" if i < 10 else "middle" if i < 20 else "end" if i < 30 else "random sample"
        chunks.append({
            "text": f"Sample data rows from {position} of dataset (rows {i + 1}-{min(i + 5, len(sample))}): "
                    + " | ".join(rows_text),
            "chunk_type": "sample_rows",
            "source": f"rows_{i + 1}_{min(i + 5, len(sample))}",
        })

    # ------------------------------------------------------------------
    # 7. Data quality summary
    # ------------------------------------------------------------------
    quality_notes = []
    for col in df.columns:
        null_pct = df[col].isna().mean() * 100
        if null_pct > 5:
            quality_notes.append(f"'{col}' is missing {null_pct:.1f}% of values ({int(df[col].isna().sum()):,} nulls)")
    if quality_notes:
        chunks.append({
            "text": f"Data quality notes for '{filename}':\n" + "\n".join(quality_notes),
            "chunk_type": "quality",
            "source": "data_quality",
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

    # Upsert in batches of 100 for large chunk sets
    batch_size = 100
    for i in range(0, len(points), batch_size):
        upsert_points(collection_name, points[i:i + batch_size])

    return len(points)

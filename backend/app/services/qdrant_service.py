from __future__ import annotations

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue
)
from app.config import settings

if settings.QDRANT_URL:
    client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY or None)
else:
    client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)


def ensure_collection(collection_name: str, vector_size: int = 384):
    """Create collection if it doesn't exist."""
    collections = [c.name for c in client.get_collections().collections]
    if collection_name not in collections:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=vector_size,
                distance=Distance.COSINE,
            ),
        )


def upsert_points(collection_name: str, points: list[PointStruct]):
    """Insert or update points in collection."""
    client.upsert(collection_name=collection_name, points=points)


def search(collection_name: str, query_vector: list[float], limit: int = 5,
           filters: dict | None = None, chunk_types: list[str] | None = None):
    """Search collection for similar vectors.

    Args:
        collection_name: Qdrant collection name
        query_vector: Query embedding vector
        limit: Max results to return
        filters: Dict of payload field -> value filters
        chunk_types: If provided, filter results to only these chunk types
                     (e.g. ['category_aggregate', 'distribution', 'column'])
    """
    conditions = []

    if filters:
        for key, value in filters.items():
            conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))

    if chunk_types and len(chunk_types) == 1:
        conditions.append(FieldCondition(key="chunk_type", match=MatchValue(value=chunk_types[0])))

    search_filter = Filter(must=conditions) if conditions else None

    results = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=limit,
        query_filter=search_filter,
        with_payload=True,
    )
    return results.points


def search_aggregates(collection_name: str, query_vector: list[float],
                      limit: int = 10) -> list:
    """Search specifically for pre-computed aggregate chunks in Qdrant.

    Returns category_aggregate and distribution chunks that are most
    relevant to the query — useful for answering analytical questions
    about large datasets without scanning the full DataFrame.
    """
    # Search for aggregate data
    agg_results = search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=limit,
        chunk_types=["category_aggregate"],
    )

    # Also fetch distribution data
    dist_results = search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=5,
        chunk_types=["distribution"],
    )

    return agg_results + dist_results


def get_collection_info(collection_name: str) -> dict | None:
    """Get collection point count and status."""
    try:
        info = client.get_collection(collection_name)
        return {
            "points_count": info.points_count,
            "status": info.status,
        }
    except Exception:
        return None

from pydantic import BaseModel
from typing import Optional


class ColumnProfile(BaseModel):
    name: str
    dtype: str
    non_null_count: int
    null_count: int
    unique_count: int
    sample_values: list
    # Numeric columns
    mean: Optional[float] = None
    median: Optional[float] = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    std: Optional[float] = None
    # Categorical columns
    top_values: Optional[dict] = None


class DatasetProfile(BaseModel):
    filename: str
    row_count: int
    column_count: int
    columns: list[ColumnProfile]
    sample_rows: list[dict]
    summary: str  # Human-readable summary from AI


class RecommendedChart(BaseModel):
    title: str
    description: str
    chart_config: dict


class MutationPreview(BaseModel):
    preview_id: str
    action: str  # "remove_outliers" | "fill_missing" | "drop_columns" | etc.
    description: str  # Human-readable: "Remove 847 outlier rows from 'price'"
    rows_before: int
    rows_after: int
    rows_affected: int
    columns_affected: list[str]
    sample_before: list[dict]  # 5 sample rows showing affected data
    sample_after: list[dict]  # 5 sample rows showing result
    details: dict  # Action-specific details (e.g. IQR bounds for outliers)


class ChatMessage(BaseModel):
    role: str  # "user" or "muse"
    content: str
    chart_config: Optional[dict] = None  # If muse suggests a chart
    table_config: Optional[dict] = None  # If muse creates a table
    recommended_charts: Optional[list[RecommendedChart]] = None  # Multiple chart recommendations
    mutation_preview: Optional[MutationPreview] = None  # Data mutation preview (agent mode)
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    dataset_id: str


class ApplyMutationRequest(BaseModel):
    dataset_id: str
    preview_id: str


class UndoMutationRequest(BaseModel):
    dataset_id: str


class StoryChapter(BaseModel):
    title: str
    narrative: str
    chart_config: Optional[dict] = None
    order: int


class Story(BaseModel):
    title: str
    chapters: list[StoryChapter]
    dataset_id: str

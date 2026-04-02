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


class ChatMessage(BaseModel):
    role: str  # "user" or "muse"
    content: str
    chart_config: Optional[dict] = None  # If muse suggests a chart
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
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

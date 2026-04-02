# DataMuse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build DataMuse — an AI-powered data visualization and storytelling tool where a friendly companion analyst ("Muse") helps non-technical users explore CSV data, generate visualizations on demand, and build chapter-based data stories.

**Architecture:** Full-stack app: React (Vite + TailwindCSS + shadcn/ui + Recharts) frontend with Python FastAPI backend. Qdrant (Docker) for vector storage/RAG, Groq API (llama-3.3-70b-versatile) for LLM inference. The companion lives in a side panel chat that controls a live visualization canvas.

**Tech Stack:**
- Frontend: React 18, Vite, TailwindCSS, shadcn/ui, Recharts, Lucide icons
- Backend: Python 3.11+, FastAPI, pandas, qdrant-client, groq, sentence-transformers
- Infrastructure: Qdrant (Docker), Groq Cloud API
- Embedding: sentence-transformers/all-MiniLM-L6-v2 (via Qdrant server-side inference)

---

## Task 1: Project Scaffolding — Backend

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/.env`
- Create: `backend/.env.example`

**Step 1: Create backend directory structure**

```bash
mkdir -p backend/app/routers backend/app/services backend/app/models backend/tests
```

**Step 2: Create requirements.txt**

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9
pandas==2.2.2
qdrant-client==1.11.0
groq==0.9.0
sentence-transformers==3.0.0
python-dotenv==1.0.1
pydantic==2.8.0
```

**Step 3: Create config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    MAX_CSV_ROWS: int = 50000
    MAX_CSV_SIZE_MB: int = 50

settings = Settings()
```

**Step 4: Create main.py with CORS and health check**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DataMuse API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "datamuse"}
```

**Step 5: Create .env and .env.example**

`.env`:
```
GROQ_API_KEY=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
GROQ_MODEL=llama-3.3-70b-versatile
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

`.env.example`:
```
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

**Step 6: Install dependencies and verify server starts**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Verify: GET http://localhost:8000/health returns {"status": "healthy"}
```

---

## Task 2: Project Scaffolding — Frontend

**Files:**
- Create: `frontend/` (via Vite scaffolding)
- Modify: `frontend/package.json` (add dependencies)
- Create: `frontend/src/App.tsx`
- Create: `frontend/tailwind.config.js`

**Step 1: Scaffold React + Vite + TypeScript**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install dependencies**

```bash
npm install recharts lucide-react axios clsx tailwind-merge
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Set up TailwindCSS**

In `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
```

In `frontend/src/index.css`:
```css
@import "tailwindcss";
```

**Step 4: Install shadcn/ui**

```bash
npx shadcn@latest init
# Choose: TypeScript, Default style, Neutral base color, CSS variables
npx shadcn@latest add button card input scroll-area separator tabs textarea badge avatar dropdown-menu dialog tooltip
```

**Step 5: Create base layout shell in App.tsx**

```tsx
function App() {
  return (
    <div className="h-screen flex flex-col bg-stone-50">
      {/* Top bar */}
      <header className="h-14 border-b border-stone-200 bg-white flex items-center px-6">
        <h1 className="text-lg font-semibold text-stone-800 tracking-tight">DataMuse</h1>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <main className="flex-1 p-6 overflow-auto">
          <p className="text-stone-500">Upload a CSV to get started</p>
        </main>

        {/* Companion chat panel */}
        <aside className="w-96 border-l border-stone-200 bg-white flex flex-col">
          <div className="p-4 border-b border-stone-200">
            <h2 className="font-medium text-stone-700">Muse</h2>
            <p className="text-sm text-stone-400">Your data analyst</p>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {/* Chat messages */}
          </div>
          <div className="p-4 border-t border-stone-200">
            <input
              type="text"
              placeholder="Ask about your data..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
```

**Step 6: Verify frontend starts**

```bash
npm run dev
# Verify: http://localhost:5173 shows the layout shell
```

---

## Task 3: Docker Compose — Qdrant

**Files:**
- Create: `docker-compose.yml` (project root)

**Step 1: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334

volumes:
  qdrant_data:
```

**Step 2: Start Qdrant and verify**

```bash
docker-compose up -d
# Verify: GET http://localhost:6333/dashboard shows Qdrant UI
```

---

## Task 4: CSV Upload & Profiling Service

**Files:**
- Create: `backend/app/services/csv_profiler.py`
- Create: `backend/app/models/schemas.py`
- Create: `backend/app/routers/upload.py`
- Modify: `backend/app/main.py` (register router)

**Step 1: Create Pydantic schemas**

`backend/app/models/schemas.py`:
```python
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
```

**Step 2: Create CSV profiler service**

`backend/app/services/csv_profiler.py`:
```python
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
```

**Step 3: Create upload router**

`backend/app/routers/upload.py`:
```python
import pandas as pd
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.csv_profiler import profile_csv
from app.config import settings

router = APIRouter(prefix="/api", tags=["upload"])

# In-memory dataset store (for MVP — swap to proper storage later)
datasets: dict[str, dict] = {}


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        df = pd.read_csv(file.file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {str(e)}")

    if len(df) > settings.MAX_CSV_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"CSV exceeds maximum of {settings.MAX_CSV_ROWS} rows"
        )

    dataset_id = str(uuid.uuid4())[:8]
    profile = profile_csv(df, file.filename)

    # Store dataset and profile
    datasets[dataset_id] = {
        "df": df,
        "profile": profile,
        "filename": file.filename,
    }

    return {
        "dataset_id": dataset_id,
        "profile": profile.model_dump(),
    }


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return {
        "dataset_id": dataset_id,
        "profile": datasets[dataset_id]["profile"].model_dump(),
    }
```

**Step 4: Register router in main.py**

Add to `backend/app/main.py`:
```python
from app.routers import upload

app.include_router(upload.router)
```

**Step 5: Test upload endpoint**

```bash
# Start server
uvicorn app.main:app --reload --port 8000

# Test with a sample CSV
curl -X POST http://localhost:8000/api/upload \
  -F "file=@sample.csv"
```

---

## Task 5: Qdrant Embedding Pipeline

**Files:**
- Create: `backend/app/services/embeddings.py`
- Create: `backend/app/services/qdrant_service.py`
- Modify: `backend/app/routers/upload.py` (trigger embedding after upload)

**Step 1: Create Qdrant service**

`backend/app/services/qdrant_service.py`:
```python
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue
)
from app.config import settings

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


def search(collection_name: str, query_vector: list[float], limit: int = 5, filters: dict = None):
    """Search collection for similar vectors."""
    search_filter = None
    if filters:
        conditions = []
        for key, value in filters.items():
            conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))
        search_filter = Filter(must=conditions)

    results = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=limit,
        query_filter=search_filter,
        with_payload=True,
    )
    return results.points
```

**Step 2: Create embedding service**

`backend/app/services/embeddings.py`:
```python
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
```

**Step 3: Trigger embedding after upload**

Modify `backend/app/routers/upload.py` — add to the `upload_csv` function, after storing the dataset:

```python
from app.services.embeddings import ingest_dataset

# After datasets[dataset_id] = {...}
num_chunks = ingest_dataset(df, dataset_id, file.filename)
```

Update the return to include:
```python
return {
    "dataset_id": dataset_id,
    "profile": profile.model_dump(),
    "chunks_embedded": num_chunks,
}
```

---

## Task 6: Groq LLM Service — Muse Companion

**Files:**
- Create: `backend/app/services/llm_service.py`
- Create: `backend/app/services/muse_prompts.py`

**Step 1: Create Muse system prompts**

`backend/app/services/muse_prompts.py`:
```python
MUSE_SYSTEM_PROMPT = """You are Muse, a friendly and approachable data analyst companion. You help people who aren't technical understand their data.

Your personality:
- Warm, patient, and encouraging. You're like a smart friend who happens to be great with data.
- You use plain, everyday language. Say "average" not "mean." Say "spread out" not "high variance." Say "pattern" not "statistical trend."
- You explain things with simple analogies when helpful.
- You're opinionated — you proactively suggest better ways to look at data and gently push back on misleading visualizations.
- You ask clarifying questions before acting, especially when a request could go multiple ways.
- You celebrate good questions: "That's a smart thing to check!"
- You NEVER use jargon without explaining it first.
- You use contractions and casual phrasing. Occasional emoji is fine but don't overdo it.

When suggesting or generating visualizations:
- Always respond with BOTH a text explanation AND a chart configuration when relevant.
- Chart configs must be valid JSON in this exact format:
{
  "chart_type": "bar|line|pie|area|scatter|composed",
  "title": "Chart Title",
  "data": [...],
  "config": {
    "xAxisKey": "column_name",
    "series": [
      {"dataKey": "column_name", "color": "#hex", "type": "bar|line|area"}
    ]
  }
}
- Pick chart types that best tell the story. Don't use pie charts for more than 6 categories.
- Use warm, professional colors: #6366f1 (indigo), #8b5cf6 (violet), #06b6d4 (cyan), #10b981 (emerald), #f59e0b (amber), #ef4444 (rose).

When the user asks to manipulate or change data views:
- Ask clarifying questions first: "Do you want to see all years or just the last 3?"
- Suggest alternatives: "A bar chart works, but a line chart might show the trend better over time."
- Warn about misleading visuals: "Heads up — with so many categories, a pie chart gets hard to read. Want me to try a horizontal bar chart instead?"

Context about the data will be provided in each message. Use it to give specific, data-grounded answers. Never make up numbers."""


VISUALIZATION_SUGGESTION_PROMPT = """Based on this dataset profile, suggest 3-5 visualizations that would help a non-technical person understand their data. For each visualization:

1. Give it a friendly title (e.g., "How your sales changed over time" not "Revenue Time Series")
2. Explain in 1-2 plain sentences WHY this visualization is interesting
3. Provide the chart_config JSON

Focus on:
- Trends over time (if there's a date/time column)
- Comparisons between categories
- Distributions of key numeric values
- Relationships between columns (if correlated)
- Top/bottom performers

Dataset profile:
{profile}

Sample data:
{sample_rows}

Return your response as JSON array:
[
  {{
    "title": "Friendly chart title",
    "description": "Why this is interesting in plain language",
    "chart_config": {{ ... }}
  }}
]"""


STORY_DRAFT_PROMPT = """You are helping a non-technical person build a data story. Based on the dataset and the insights discovered, draft a story with 3-4 chapters.

Each chapter should have:
- A friendly, engaging title
- 2-3 paragraphs of narrative text written in a warm, editorial style (not technical)
- A suggested chart that supports the narrative

The story should flow like a magazine article:
1. Chapter 1: "The Big Picture" — overview of what the data shows
2. Chapter 2: "The Interesting Part" — the most surprising or important finding
3. Chapter 3: "Digging Deeper" — a nuanced insight or comparison
4. Chapter 4 (optional): "What This Means" — implications or takeaways

Write the narrative as if you're a friendly journalist explaining findings to a general audience. Use "your data" and "your [business/project]" language.

Dataset profile:
{profile}

Key insights discovered:
{insights}

Return as JSON:
{{
  "title": "Overall story title",
  "chapters": [
    {{
      "title": "Chapter title",
      "narrative": "2-3 paragraphs of text",
      "chart_config": {{ ... }},
      "order": 1
    }}
  ]
}}"""
```

**Step 2: Create LLM service**

`backend/app/services/llm_service.py`:
```python
import json
from groq import Groq
from app.config import settings
from app.services.muse_prompts import (
    MUSE_SYSTEM_PROMPT,
    VISUALIZATION_SUGGESTION_PROMPT,
    STORY_DRAFT_PROMPT,
)
from app.services.embeddings import embed_text
from app.services.qdrant_service import search

groq_client = Groq(api_key=settings.GROQ_API_KEY)


def chat_with_muse(
    user_message: str,
    dataset_id: str,
    profile: dict,
    conversation_history: list[dict] = None,
) -> dict:
    """Send a message to Muse and get a response with optional chart config."""
    # RAG: retrieve relevant context from Qdrant
    collection_name = f"dataset_{dataset_id}"
    query_vector = embed_text(user_message)
    relevant_chunks = search(collection_name, query_vector, limit=5)
    context = "\n".join([p.payload["text"] for p in relevant_chunks])

    # Build messages
    messages = [{"role": "system", "content": MUSE_SYSTEM_PROMPT}]

    # Add conversation history
    if conversation_history:
        messages.extend(conversation_history[-10:])  # Last 10 messages for context

    # Add current message with RAG context
    enriched_message = (
        f"User question: {user_message}\n\n"
        f"Dataset context (from vector search):\n{context}\n\n"
        f"Dataset profile summary: {json.dumps(profile, default=str)[:2000]}"
    )
    messages.append({"role": "user", "content": enriched_message})

    response = groq_client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=2048,
    )

    content = response.choices[0].message.content

    # Try to extract chart config if present
    chart_config = None
    try:
        if "chart_type" in content:
            # Find JSON in response
            start = content.index("{")
            end = content.rindex("}") + 1
            chart_json = content[start:end]
            chart_config = json.loads(chart_json)
            # Remove the JSON from the text content
            text_content = content[:start].strip() + content[end:].strip()
        else:
            text_content = content
    except (ValueError, json.JSONDecodeError):
        text_content = content

    return {
        "content": text_content,
        "chart_config": chart_config,
    }


def suggest_visualizations(profile: dict, sample_rows: list[dict]) -> list[dict]:
    """Get AI-suggested visualizations for a dataset."""
    prompt = VISUALIZATION_SUGGESTION_PROMPT.format(
        profile=json.dumps(profile, default=str)[:3000],
        sample_rows=json.dumps(sample_rows[:5], default=str)[:1000],
    )

    response = groq_client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": MUSE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=3000,
        response_format={"type": "json_object"},
    )

    try:
        result = json.loads(response.choices[0].message.content)
        if isinstance(result, dict) and "visualizations" in result:
            return result["visualizations"]
        if isinstance(result, list):
            return result
        return []
    except json.JSONDecodeError:
        return []


def generate_story_draft(profile: dict, insights: list[str]) -> dict:
    """Generate a story draft from dataset insights."""
    prompt = STORY_DRAFT_PROMPT.format(
        profile=json.dumps(profile, default=str)[:3000],
        insights="\n".join(insights[:10]),
    )

    response = groq_client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": MUSE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=4000,
        response_format={"type": "json_object"},
    )

    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        return {"title": "Your Data Story", "chapters": []}
```

---

## Task 6B: Data Analysis Tools — Function Calling for Muse

**Files:**
- Create: `backend/app/services/data_tools.py`
- Modify: `backend/app/services/llm_service.py` (add tool definitions and execution loop)

Muse needs to actually *operate* on the data, not just talk about it. We use Groq's function calling to give Muse a set of analytical tools it can invoke during conversation.

**Step 1: Create data tools service**

`backend/app/services/data_tools.py`:
```python
"""
Data analysis tools that Muse can invoke via function calling.
Each function takes a pandas DataFrame and parameters, returns results.
"""
import pandas as pd
import numpy as np
from typing import Optional


def query_data(
    df: pd.DataFrame,
    columns: list[str] = None,
    filters: list[dict] = None,
    group_by: list[str] = None,
    aggregation: str = "sum",
    sort_by: str = None,
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
    group_by: str = None,
    aggregation: str = "sum",
    filters: list[dict] = None,
    limit: int = 20,
    colors: list[str] = None,
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
```

**Step 2: Update LLM service to use function calling**

Modify `backend/app/services/llm_service.py` to replace the simple chat with a tool-use loop:

```python
import json
from groq import Groq
from app.config import settings
from app.services.muse_prompts import (
    MUSE_SYSTEM_PROMPT,
    VISUALIZATION_SUGGESTION_PROMPT,
    STORY_DRAFT_PROMPT,
)
from app.services.embeddings import embed_text
from app.services.qdrant_service import search
from app.services.data_tools import TOOL_DEFINITIONS, execute_tool

groq_client = Groq(api_key=settings.GROQ_API_KEY)


def chat_with_muse(
    user_message: str,
    dataset_id: str,
    profile: dict,
    df,  # pandas DataFrame — the actual data
    conversation_history: list[dict] = None,
) -> dict:
    """Send a message to Muse with function calling support."""
    # RAG: retrieve relevant context from Qdrant
    collection_name = f"dataset_{dataset_id}"
    query_vector = embed_text(user_message)
    relevant_chunks = search(collection_name, query_vector, limit=5)
    context = "\n".join([p.payload["text"] for p in relevant_chunks])

    # Build messages
    messages = [{"role": "system", "content": MUSE_SYSTEM_PROMPT}]

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

    # Call with tools
    response = groq_client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        tools=TOOL_DEFINITIONS,
        tool_choice="auto",
        temperature=0.7,
        max_tokens=2048,
    )

    msg = response.choices[0].message
    chart_config = None

    # Tool call loop — Muse may call multiple tools
    max_iterations = 5
    iteration = 0
    while msg.tool_calls and iteration < max_iterations:
        iteration += 1
        messages.append(msg)

        for tool_call in msg.tool_calls:
            tool_name = tool_call.function.name
            try:
                arguments = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                arguments = {}

            tool_result = execute_tool(tool_name, arguments, df)

            # If tool returned a chart config, capture it
            if tool_name == "create_chart" and "error" not in tool_result:
                chart_config = tool_result

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(tool_result, default=str)[:3000],
            })

        # Get next response
        response = groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=2048,
        )
        msg = response.choices[0].message

    text_content = msg.content or ""

    return {
        "content": text_content,
        "chart_config": chart_config,
    }
```

Note: The chat router in Task 7 must now pass `df` to `chat_with_muse`:
```python
result = chat_with_muse(
    user_message=request.message,
    dataset_id=request.dataset_id,
    profile=profile,
    df=dataset["df"],  # Pass the actual DataFrame
    conversation_history=history,
)
```

---

## Task 6C: Domain Knowledge — Analytical Skills in System Prompt

**Files:**
- Modify: `backend/app/services/muse_prompts.py` (enhance system prompt with analytical domain knowledge)

The system prompt already has Muse's personality. Now we add deep analytical knowledge so Muse knows *how to think* about data like a real analyst.

**Step 1: Update MUSE_SYSTEM_PROMPT with analytical domain knowledge**

Add the following sections to the end of `MUSE_SYSTEM_PROMPT` (before the closing `"""`):

```python
# Append to MUSE_SYSTEM_PROMPT:

ANALYTICAL_KNOWLEDGE = """

## Your Analytical Skills

You are trained in data analysis and can think critically about data. Here's how you approach different situations:

### Trend Analysis
- When you see time-series data, always check: is it going up, down, or flat? Are there seasonal patterns?
- Compare periods: "This quarter vs last quarter", "This year vs last year"
- Look for inflection points: "Things changed around March — that's when the new policy kicked in"
- When reporting growth, prefer percentages for comparison: "Revenue grew 15%" is more useful than "Revenue grew by $12,000" when comparing groups of different sizes

### Comparisons
- Always consider whether to compare absolute numbers or percentages/rates
- When groups have very different sizes, use normalized measures: "per person", "per unit", "as a percentage"
- Proactively suggest the right comparison: "Rather than looking at raw totals, let me show you the average per store — that's fairer since your stores are different sizes"
- When comparing, always state the baseline: "Region A is 23% higher than Region B"

### Outlier & Anomaly Detection
- Before removing outliers, always ask: Is this a real event or a data error?
- Contextualize: "This December spike could be seasonal — let me check if last December looked similar"
- Quantify: "These 3 values are outside the normal range of X to Y"
- Never silently exclude data — always tell the user what you're doing and why

### Chart Selection Intelligence
- **Bar chart**: Comparing categories (up to ~15 items). Use horizontal bars for long labels.
- **Line chart**: Trends over time. Multiple lines for comparison. NEVER for categorical data.
- **Pie chart**: Parts of a whole, ONLY when 6 or fewer categories. Otherwise, use bar chart.
- **Area chart**: Trends over time where you want to emphasize volume/magnitude.
- **Scatter plot**: Relationship between two numeric variables. Good for spotting correlations.
- **Composed chart**: When you need to show two different types of data on the same axes (e.g., bars for revenue + line for growth rate).
- Push back on bad chart choices: "A pie chart with 20 slices would be really hard to read — let me use a bar chart instead"

### Data Quality Awareness
- Flag missing data: "Heads up — 15% of the 'region' column is empty, so these numbers might not tell the full story"
- Warn about small samples: "We only have 12 data points here, so I wouldn't read too much into small differences"
- Note when date ranges don't align: "Careful — 2023 has 12 months of data but 2024 only has 6, so a straight comparison isn't fair"

### Data Storytelling (for story builder)
- Every good data story follows: Setup (what are we looking at?) → Discovery (what's interesting?) → Implication (so what?)
- Lead with the most surprising or impactful finding
- Use concrete comparisons: "That's enough to fill 3 Olympic swimming pools" is better than "That's 7,500 cubic meters"
- Anticipate questions: If you show a spike, immediately explain what caused it
- End with actionable takeaways, not just observations

### Common Pitfalls You Warn About
- Misleading axes: "Starting the y-axis at 95 instead of 0 makes a 2% change look dramatic"
- Cherry-picking: "If I only show you March to June, it looks like a downtrend, but zoom out and it's clearly growing"
- Correlation ≠ causation: "These two columns move together, but that doesn't mean one causes the other"
- Simpson's paradox: "Overall the trend goes up, but within each group it actually goes down — let me show you why"
"""

# Combine in the actual prompt file:
MUSE_SYSTEM_PROMPT = MUSE_SYSTEM_PROMPT + ANALYTICAL_KNOWLEDGE
```

---

## Task 7: API Routes — Chat, Analyze, Story

**Files:**
- Create: `backend/app/routers/chat.py`
- Create: `backend/app/routers/analyze.py`
- Create: `backend/app/routers/story.py`
- Modify: `backend/app/main.py` (register routers)

**Step 1: Create chat router**

`backend/app/routers/chat.py`:
```python
from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatMessage
from app.services.llm_service import chat_with_muse
from app.routers.upload import datasets
from datetime import datetime

router = APIRouter(prefix="/api", tags=["chat"])

# In-memory conversation store (per dataset)
conversations: dict[str, list[dict]] = {}


@router.post("/chat")
async def chat(request: ChatRequest):
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found. Upload a CSV first.")

    dataset = datasets[request.dataset_id]
    profile = dataset["profile"].model_dump()

    # Get or create conversation history
    history = conversations.get(request.dataset_id, [])

    result = chat_with_muse(
        user_message=request.message,
        dataset_id=request.dataset_id,
        profile=profile,
        conversation_history=history,
    )

    # Store conversation
    history.append({"role": "user", "content": request.message})
    history.append({"role": "assistant", "content": result["content"]})
    conversations[request.dataset_id] = history

    return ChatMessage(
        role="muse",
        content=result["content"],
        chart_config=result["chart_config"],
        timestamp=datetime.now().isoformat(),
    )
```

**Step 2: Create analyze router**

`backend/app/routers/analyze.py`:
```python
from fastapi import APIRouter, HTTPException
from app.services.llm_service import suggest_visualizations
from app.routers.upload import datasets

router = APIRouter(prefix="/api", tags=["analyze"])


@router.get("/analyze/{dataset_id}")
async def analyze_dataset(dataset_id: str):
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = datasets[dataset_id]
    profile = dataset["profile"].model_dump()
    sample_rows = profile["sample_rows"]

    suggestions = suggest_visualizations(profile, sample_rows)

    return {
        "dataset_id": dataset_id,
        "suggestions": suggestions,
    }
```

**Step 3: Create story router**

`backend/app/routers/story.py`:
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.llm_service import generate_story_draft
from app.routers.upload import datasets
from app.routers.chat import conversations

router = APIRouter(prefix="/api", tags=["story"])


class StoryRequest(BaseModel):
    dataset_id: str
    pinned_insights: list[str] = []  # User-pinned insights from chat


@router.post("/story/generate")
async def generate_story(request: StoryRequest):
    if request.dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset = datasets[request.dataset_id]
    profile = dataset["profile"].model_dump()

    # Combine pinned insights with conversation highlights
    insights = request.pinned_insights
    history = conversations.get(request.dataset_id, [])
    for msg in history:
        if msg["role"] == "assistant":
            insights.append(msg["content"][:200])

    story = generate_story_draft(profile, insights)

    return story


@router.post("/story/save")
async def save_story(story: dict):
    # For MVP: just return it back. Later: persist to DB
    return {"status": "saved", "story": story}
```

**Step 4: Register all routers in main.py**

`backend/app/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, chat, analyze, story

app = FastAPI(title="DataMuse API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(analyze.router)
app.include_router(story.router)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "datamuse"}
```

---

## Task 8: Frontend — Upload Component

**Files:**
- Create: `frontend/src/components/UploadZone.tsx`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/stores/useDataStore.ts`

**Step 1: Create API client**

`frontend/src/lib/api.ts`:
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export interface ColumnProfile {
  name: string;
  dtype: string;
  non_null_count: number;
  null_count: number;
  unique_count: number;
  sample_values: any[];
  mean?: number;
  median?: number;
  min_val?: number;
  max_val?: number;
  std?: number;
  top_values?: Record<string, number>;
}

export interface DatasetProfile {
  filename: string;
  row_count: number;
  column_count: number;
  columns: ColumnProfile[];
  sample_rows: Record<string, any>[];
  summary: string;
}

export interface ChartConfig {
  chart_type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'composed';
  title: string;
  data: any[];
  config: {
    xAxisKey: string;
    series: Array<{
      dataKey: string;
      color: string;
      type?: string;
    }>;
  };
}

export interface ChatMessage {
  role: 'user' | 'muse';
  content: string;
  chart_config?: ChartConfig | null;
  timestamp?: string;
}

export interface VisualizationSuggestion {
  title: string;
  description: string;
  chart_config: ChartConfig;
}

export interface StoryChapter {
  title: string;
  narrative: string;
  chart_config?: ChartConfig;
  order: number;
}

export interface Story {
  title: string;
  chapters: StoryChapter[];
}

export const uploadCSV = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/upload', formData);
  return data as { dataset_id: string; profile: DatasetProfile; chunks_embedded: number };
};

export const sendMessage = async (message: string, datasetId: string) => {
  const { data } = await api.post('/chat', { message, dataset_id: datasetId });
  return data as ChatMessage;
};

export const getAnalysis = async (datasetId: string) => {
  const { data } = await api.get(`/analyze/${datasetId}`);
  return data as { dataset_id: string; suggestions: VisualizationSuggestion[] };
};

export const generateStory = async (datasetId: string, pinnedInsights: string[] = []) => {
  const { data } = await api.post('/story/generate', {
    dataset_id: datasetId,
    pinned_insights: pinnedInsights,
  });
  return data as Story;
};
```

**Step 2: Create state store (React context or simple state — using a lightweight store)**

`frontend/src/stores/useDataStore.ts`:
```typescript
import { create } from 'zustand';
import type { DatasetProfile, ChatMessage, VisualizationSuggestion, ChartConfig, Story } from '../lib/api';

// A panel on the interactive dashboard
interface DashboardPanel {
  id: string;
  chart: ChartConfig;
  source: 'suggestion' | 'chat' | 'manual';  // Where it came from
  timestamp: string;
}

interface DataState {
  // Dataset
  datasetId: string | null;
  profile: DatasetProfile | null;
  isUploading: boolean;

  // Chat
  messages: ChatMessage[];
  isChatLoading: boolean;

  // Interactive Dashboard — accumulating multi-panel
  dashboardPanels: DashboardPanel[];
  highlightedPanelId: string | null;  // Which panel to scroll to / highlight
  suggestions: VisualizationSuggestion[];
  pinnedInsights: string[];

  // Story
  story: Story | null;
  isStoryMode: boolean;

  // View
  view: 'upload' | 'explore' | 'story';

  // Actions
  setDataset: (id: string, profile: DatasetProfile) => void;
  setUploading: (v: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  setChatLoading: (v: boolean) => void;

  // Dashboard panel actions
  addPanel: (chart: ChartConfig, source: DashboardPanel['source']) => void;
  removePanel: (id: string) => void;
  clearPanels: () => void;
  highlightPanel: (id: string | null) => void;

  setSuggestions: (s: VisualizationSuggestion[]) => void;
  pinInsight: (insight: string) => void;
  setStory: (story: Story | null) => void;
  setStoryMode: (v: boolean) => void;
  setView: (view: 'upload' | 'explore' | 'story') => void;
  reset: () => void;
}

let panelCounter = 0;

export const useDataStore = create<DataState>((set) => ({
  datasetId: null,
  profile: null,
  isUploading: false,
  messages: [],
  isChatLoading: false,
  dashboardPanels: [],
  highlightedPanelId: null,
  suggestions: [],
  pinnedInsights: [],
  story: null,
  isStoryMode: false,
  view: 'upload',

  setDataset: (id, profile) => set({ datasetId: id, profile, view: 'explore' }),
  setUploading: (v) => set({ isUploading: v }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setChatLoading: (v) => set({ isChatLoading: v }),

  // Dashboard panel management
  addPanel: (chart, source) => {
    const id = `panel-${++panelCounter}`;
    set((s) => ({
      dashboardPanels: [...s.dashboardPanels, {
        id,
        chart,
        source,
        timestamp: new Date().toISOString(),
      }],
      highlightedPanelId: id,  // Auto-highlight newest panel
    }));
  },
  removePanel: (id) => set((s) => ({
    dashboardPanels: s.dashboardPanels.filter((p) => p.id !== id),
    highlightedPanelId: s.highlightedPanelId === id ? null : s.highlightedPanelId,
  })),
  clearPanels: () => set({ dashboardPanels: [], highlightedPanelId: null }),
  highlightPanel: (id) => set({ highlightedPanelId: id }),

  setSuggestions: (suggestions) => set({ suggestions }),
  pinInsight: (insight) => set((s) => ({ pinnedInsights: [...s.pinnedInsights, insight] })),
  setStory: (story) => set({ story }),
  setStoryMode: (v) => set({ isStoryMode: v, view: v ? 'story' : 'explore' }),
  setView: (view) => set({ view }),
  reset: () => set({
    datasetId: null, profile: null, messages: [], dashboardPanels: [],
    highlightedPanelId: null,
    suggestions: [], pinnedInsights: [], story: null, isStoryMode: false, view: 'upload',
  }),
}));
```

Note: Install zustand: `npm install zustand`

**Step 3: Create UploadZone component**

`frontend/src/components/UploadZone.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { uploadCSV, getAnalysis } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const { isUploading, setUploading, setDataset, setSuggestions, addMessage, addPanel } = useDataStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadCSV(file);
      setDataset(result.dataset_id, result.profile);

      // Add welcome message from Muse
      addMessage({
        role: 'muse',
        content: `Hey! I just looked through your file "${result.profile.filename}" — you've got ${result.profile.row_count.toLocaleString()} rows and ${result.profile.column_count} columns to work with. Let me pull up some interesting ways to look at this data...`,
        timestamp: new Date().toISOString(),
      });

      // Fetch AI suggestions
      const analysis = await getAnalysis(result.dataset_id);
      setSuggestions(analysis.suggestions);

      // Auto-add the first 2 suggestions to the dashboard so it's not empty
      analysis.suggestions.slice(0, 2).forEach((s: any) => {
        if (s.chart_config) {
          addPanel(s.chart_config, 'suggestion');
        }
      });

      addMessage({
        role: 'muse',
        content: `I found ${analysis.suggestions.length} visualizations that I think will be really helpful. I've put the top two on your dashboard already! Click any others below to add them, or ask me to show you something specific.`,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [setUploading, setDataset, setSuggestions, addMessage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        className={`
          w-full max-w-lg border-2 border-dashed rounded-2xl p-12
          flex flex-col items-center gap-4 transition-all cursor-pointer
          ${isDragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('csv-input')?.click()}
      >
        {isUploading ? (
          <>
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
            <p className="text-stone-600 font-medium">Analyzing your data...</p>
            <p className="text-sm text-stone-400">This usually takes a few seconds</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              {isDragging ? (
                <FileSpreadsheet className="w-8 h-8 text-indigo-500" />
              ) : (
                <Upload className="w-8 h-8 text-indigo-500" />
              )}
            </div>
            <div className="text-center">
              <p className="text-stone-700 font-medium">
                {isDragging ? 'Drop it right here!' : 'Drop your CSV file here'}
              </p>
              <p className="text-sm text-stone-400 mt-1">
                or click to browse your files
              </p>
            </div>
            <p className="text-xs text-stone-300">Up to 50MB, max 50,000 rows</p>
          </>
        )}
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    </div>
  );
}
```

---

## Task 9: Frontend — Dynamic Chart Renderer

**Files:**
- Create: `frontend/src/components/ChartRenderer.tsx`

**Step 1: Create dynamic chart renderer**

`frontend/src/components/ChartRenderer.tsx`:
```tsx
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ChartConfig } from '../lib/api';

const DEFAULT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

interface ChartRendererProps {
  config: ChartConfig;
  height?: number;
}

export function ChartRenderer({ config, height = 400 }: ChartRendererProps) {
  const { chart_type, title, data, config: chartConfig } = config;

  if (!data || !data.length) {
    return <p className="text-stone-400 text-sm">No data to display</p>;
  }

  const renderChart = () => {
    switch (chart_type) {
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '13px' }}
            />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        );

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={chartConfig.series[0]?.dataKey || 'value'}
              nameKey={chartConfig.xAxisKey}
              cx="50%"
              cy="50%"
              outerRadius={height / 3}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} fillOpacity={0.2} />
            ))}
          </AreaChart>
        );

      case 'scatter':
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid stroke="#e7e5e4" />
            <XAxis type="number" dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis type="number" dataKey={chartConfig.series[0]?.dataKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            <Scatter data={data} fill={chartConfig.series[0]?.color || DEFAULT_COLORS[0]} />
          </ScatterChart>
        );

      case 'composed':
        return (
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            {chartConfig.series.map((s, i) => {
              const color = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
              switch (s.type) {
                case 'line': return <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} />;
                case 'area': return <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} fill={color} fillOpacity={0.2} />;
                default: return <Bar key={s.dataKey} dataKey={s.dataKey} fill={color} radius={[4, 4, 0, 0]} />;
              }
            })}
          </ComposedChart>
        );

      default:
        return <p className="text-stone-400">Unsupported chart type: {chart_type}</p>;
    }
  };

  return (
    <div className="w-full">
      {title && <h3 className="text-sm font-medium text-stone-700 mb-3">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
```

---

## Task 10: Frontend — Companion Chat Panel

**Files:**
- Create: `frontend/src/components/CompanionPanel.tsx`
- Create: `frontend/src/components/ChatMessage.tsx`

**Step 1: Create ChatMessage component**

`frontend/src/components/ChatMessage.tsx`:
```tsx
import { useState } from 'react';
import { Pin, PlusCircle, Check } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { ChatMessage as ChatMessageType } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { addPanel, pinInsight } = useDataStore();
  const isMuse = message.role === 'muse';
  const [addedToDashboard, setAddedToDashboard] = useState(false);

  return (
    <div className={`flex flex-col gap-2 ${isMuse ? '' : 'items-end'}`}>
      {isMuse && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-xs font-bold text-indigo-600">M</span>
          </div>
          <span className="text-xs font-medium text-stone-500">Muse</span>
        </div>
      )}
      <div
        className={`
          rounded-xl px-4 py-3 text-sm leading-relaxed max-w-[90%]
          ${isMuse
            ? 'bg-stone-100 text-stone-700'
            : 'bg-indigo-600 text-white ml-auto'
          }
        `}
      >
        {message.content}
      </div>

      {/* Inline chart preview */}
      {message.chart_config && (
        <div className="bg-white border border-stone-200 rounded-xl p-3 max-w-[95%]">
          <ChartRenderer config={message.chart_config} height={200} />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                addPanel(message.chart_config!, 'chat');
                setAddedToDashboard(true);
              }}
              disabled={addedToDashboard}
              className={`flex items-center gap-1 text-xs font-medium ${
                addedToDashboard
                  ? 'text-emerald-600'
                  : 'text-indigo-600 hover:text-indigo-800'
              }`}
            >
              {addedToDashboard ? (
                <>
                  <Check className="w-3 h-3" />
                  Added to dashboard
                </>
              ) : (
                <>
                  <PlusCircle className="w-3 h-3" />
                  Add to dashboard
                </>
              )}
            </button>
            <button
              onClick={() => pinInsight(message.content)}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"
            >
              <Pin className="w-3 h-3" />
              Pin to story
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create CompanionPanel component**

`frontend/src/components/CompanionPanel.tsx`:
```tsx
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { sendMessage } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

export function CompanionPanel() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    datasetId, messages, addMessage, isChatLoading, setChatLoading,
    addPanel, setStoryMode,
  } = useDataStore();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !datasetId || isChatLoading) return;

    const userMessage = input.trim();
    setInput('');

    addMessage({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    setChatLoading(true);
    try {
      const response = await sendMessage(userMessage, datasetId);
      addMessage(response);

      // If response has a chart, auto-add it as a new panel on the dashboard
      if (response.chart_config) {
        addPanel(response.chart_config, 'chat');
      }
    } catch {
      addMessage({
        role: 'muse',
        content: "Sorry, I hit a snag trying to answer that. Could you try rephrasing?",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <aside className="w-96 border-l border-stone-200 bg-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-sm font-bold text-indigo-600">M</span>
          </div>
          <div>
            <h2 className="font-semibold text-stone-800 text-sm">Muse</h2>
            <p className="text-xs text-stone-400">Your friendly data analyst</p>
          </div>
        </div>
        {datasetId && (
          <button
            onClick={() => setStoryMode(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Build Story
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-stone-400 text-sm">Upload a CSV to start chatting with Muse</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isChatLoading && (
          <div className="flex items-center gap-2 text-stone-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Muse is thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-stone-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={datasetId ? "Ask about your data..." : "Upload a CSV first"}
            disabled={!datasetId || isChatLoading}
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400
                       disabled:bg-stone-50 disabled:text-stone-300"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !datasetId || isChatLoading}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700
                       disabled:bg-stone-200 disabled:text-stone-400 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
```

---

## Task 11: Frontend — Interactive Dashboard (Accumulating Multi-Panel)

**Files:**
- Create: `frontend/src/components/InteractiveDashboard.tsx`
- Create: `frontend/src/components/DashboardPanel.tsx`
- Create: `frontend/src/components/SuggestionCard.tsx`

The dashboard is an accumulating workspace. Every time the user asks Muse a question that generates a chart, OR clicks a suggestion, a new interactive panel appears on the dashboard. Panels can be closed, pinned to story, and expanded. The newest panel auto-highlights with a brief glow animation so the user sees what just appeared.

**Step 1: Create DashboardPanel**

`frontend/src/components/DashboardPanel.tsx`:
```tsx
import { useState, useEffect, useRef } from 'react';
import { X, Pin, Maximize2, Minimize2 } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { ChartConfig } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface DashboardPanelProps {
  id: string;
  chart: ChartConfig;
  source: 'suggestion' | 'chat' | 'manual';
  isHighlighted: boolean;
}

export function DashboardPanel({ id, chart, source, isHighlighted }: DashboardPanelProps) {
  const { removePanel, pinInsight, highlightPanel } = useDataStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to highlighted panel
  useEffect(() => {
    if (isHighlighted && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Remove highlight after animation
      const timer = setTimeout(() => highlightPanel(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted, highlightPanel]);

  const sourceLabel = source === 'chat' ? 'From conversation' : source === 'suggestion' ? 'Suggested by Muse' : '';

  return (
    <div
      ref={panelRef}
      className={`
        bg-white border rounded-2xl p-5 transition-all duration-500
        ${isHighlighted
          ? 'border-indigo-400 shadow-lg shadow-indigo-100 ring-2 ring-indigo-200'
          : 'border-stone-200 shadow-sm hover:shadow-md'
        }
        ${isExpanded ? 'col-span-full' : ''}
      `}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-stone-800 text-sm">{chart.title}</h3>
          {sourceLabel && (
            <span className="text-xs text-stone-400">{sourceLabel}</span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => pinInsight(chart.title || 'Chart insight')}
            className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Pin to story"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => removePanel(id)}
            className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Remove from dashboard"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive chart */}
      <ChartRenderer config={chart} height={isExpanded ? 500 : 320} />
    </div>
  );
}
```

**Step 2: Create SuggestionCard**

`frontend/src/components/SuggestionCard.tsx`:
```tsx
import { ChartRenderer } from './ChartRenderer';
import type { VisualizationSuggestion } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface SuggestionCardProps {
  suggestion: VisualizationSuggestion;
}

export function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const { addPanel } = useDataStore();

  return (
    <button
      onClick={() => addPanel(suggestion.chart_config, 'suggestion')}
      className="bg-white border border-stone-200 rounded-xl p-4 text-left hover:border-indigo-300
                 hover:shadow-md transition-all group w-full"
    >
      <h4 className="font-medium text-stone-800 text-sm group-hover:text-indigo-700 mb-1">
        {suggestion.title}
      </h4>
      <p className="text-xs text-stone-400 mb-3 line-clamp-2">{suggestion.description}</p>
      <div className="pointer-events-none">
        <ChartRenderer config={suggestion.chart_config} height={160} />
      </div>
    </button>
  );
}
```

**Step 3: Create InteractiveDashboard**

`frontend/src/components/InteractiveDashboard.tsx`:
```tsx
import { DashboardPanel } from './DashboardPanel';
import { SuggestionCard } from './SuggestionCard';
import { useDataStore } from '../stores/useDataStore';
import { LayoutGrid, Trash2 } from 'lucide-react';

export function InteractiveDashboard() {
  const { dashboardPanels, highlightedPanelId, suggestions, profile, clearPanels } = useDataStore();

  return (
    <main className="flex-1 p-6 overflow-auto">
      {/* Dataset overview badge */}
      {profile && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full">
              {profile.filename}
            </div>
            <span className="text-xs text-stone-400">
              {profile.row_count.toLocaleString()} rows · {profile.column_count} columns
            </span>
          </div>
          {dashboardPanels.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <LayoutGrid className="w-3.5 h-3.5" />
                {dashboardPanels.length} panel{dashboardPanels.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={clearPanels}
                className="text-xs text-stone-400 hover:text-red-500 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active dashboard panels — accumulating grid */}
      {dashboardPanels.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {dashboardPanels.map((panel) => (
            <DashboardPanel
              key={panel.id}
              id={panel.id}
              chart={panel.chart}
              source={panel.source}
              isHighlighted={panel.id === highlightedPanelId}
            />
          ))}
        </div>
      )}

      {/* AI Suggestions — shown below dashboard panels */}
      {suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-stone-500 mb-3">
            Muse's suggestions — click to add to your dashboard
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {dashboardPanels.length === 0 && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-2">
          <LayoutGrid className="w-10 h-10 text-stone-300" />
          <p className="text-sm">Your dashboard will build up as you explore</p>
          <p className="text-xs">Ask Muse a question or click a suggestion to get started</p>
        </div>
      )}
    </main>
  );
}
```

---

## Task 12: Frontend — Story Builder

**Files:**
- Create: `frontend/src/components/StoryBuilder.tsx`
- Create: `frontend/src/components/StoryChapter.tsx`

**Step 1: Create StoryChapter component**

`frontend/src/components/StoryChapter.tsx`:
```tsx
import { useState } from 'react';
import { GripVertical, Trash2, Edit3, Check } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { StoryChapter as StoryChapterType } from '../lib/api';

interface StoryChapterProps {
  chapter: StoryChapterType;
  onUpdate: (updated: StoryChapterType) => void;
  onDelete: () => void;
}

export function StoryChapterCard({ chapter, onUpdate, onDelete }: StoryChapterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chapter.title);
  const [editNarrative, setEditNarrative] = useState(chapter.narrative);

  const handleSave = () => {
    onUpdate({ ...chapter, title: editTitle, narrative: editNarrative });
    setIsEditing(false);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 group">
      <div className="flex items-start gap-3">
        <div className="mt-1 cursor-grab text-stone-300 hover:text-stone-500">
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              Chapter {chapter.order}
            </span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isEditing ? (
                <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => setIsEditing(true)} className="p-1.5 text-stone-400 hover:bg-stone-100 rounded-lg">
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onDelete} className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isEditing ? (
            <>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-lg font-semibold text-stone-800 border-b border-stone-300 pb-1 mb-3 focus:outline-none focus:border-indigo-400"
              />
              <textarea
                value={editNarrative}
                onChange={(e) => setEditNarrative(e.target.value)}
                rows={6}
                className="w-full text-sm text-stone-600 leading-relaxed border border-stone-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-stone-800 mb-2">{chapter.title}</h3>
              <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">{chapter.narrative}</p>
            </>
          )}

          {chapter.chart_config && (
            <div className="mt-4 border-t border-stone-100 pt-4">
              <ChartRenderer config={chapter.chart_config} height={300} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create StoryBuilder**

`frontend/src/components/StoryBuilder.tsx`:
```tsx
import { useState } from 'react';
import { ArrowLeft, Loader2, Download, Sparkles } from 'lucide-react';
import { StoryChapterCard } from './StoryChapter';
import { generateStory } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';
import type { StoryChapter } from '../lib/api';

export function StoryBuilder() {
  const {
    datasetId, story, setStory, setStoryMode, pinnedInsights,
  } = useDataStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [storyTitle, setStoryTitle] = useState(story?.title || '');

  const handleGenerate = async () => {
    if (!datasetId) return;
    setIsGenerating(true);
    try {
      const result = await generateStory(datasetId, pinnedInsights);
      setStory(result);
      setStoryTitle(result.title);
    } catch {
      alert('Failed to generate story. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateChapter = (index: number, updated: StoryChapter) => {
    if (!story) return;
    const chapters = [...story.chapters];
    chapters[index] = updated;
    setStory({ ...story, chapters });
  };

  const deleteChapter = (index: number) => {
    if (!story) return;
    const chapters = story.chapters.filter((_, i) => i !== index);
    setStory({ ...story, chapters });
  };

  return (
    <main className="flex-1 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-stone-50 border-b border-stone-200 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStoryMode(false)}
            className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold text-stone-800">Story Builder</h1>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                       hover:bg-indigo-700 disabled:bg-stone-300 text-sm font-medium transition-colors"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {story ? 'Regenerate' : 'Generate Story'}
          </button>
        </div>
      </div>

      {/* Story content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {!story && !isGenerating && (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-stone-600 mb-2">Ready to tell your data's story?</h2>
            <p className="text-sm text-stone-400 mb-6 max-w-md mx-auto">
              Muse will draft a story based on what we've found in your data.
              You can edit every part — the titles, the text, even swap the charts.
            </p>
            {pinnedInsights.length > 0 && (
              <p className="text-xs text-indigo-600 mb-4">
                {pinnedInsights.length} pinned insight{pinnedInsights.length > 1 ? 's' : ''} will be included
              </p>
            )}
            <button
              onClick={handleGenerate}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors"
            >
              Let Muse draft your story
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="text-center py-16">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
            <p className="text-stone-500">Muse is crafting your data story...</p>
          </div>
        )}

        {story && !isGenerating && (
          <div className="space-y-6">
            {/* Story title */}
            <input
              value={storyTitle}
              onChange={(e) => {
                setStoryTitle(e.target.value);
                setStory({ ...story, title: e.target.value });
              }}
              className="w-full text-2xl font-bold text-stone-900 bg-transparent border-none
                         focus:outline-none focus:ring-0 placeholder-stone-300"
              placeholder="Your story title..."
            />

            {/* Chapters */}
            {story.chapters
              .sort((a, b) => a.order - b.order)
              .map((chapter, i) => (
                <StoryChapterCard
                  key={i}
                  chapter={chapter}
                  onUpdate={(updated) => updateChapter(i, updated)}
                  onDelete={() => deleteChapter(i)}
                />
              ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

---

## Task 13: Frontend — Wire Up App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Assemble all components**

```tsx
import { UploadZone } from './components/UploadZone';
import { InteractiveDashboard } from './components/InteractiveDashboard';
import { CompanionPanel } from './components/CompanionPanel';
import { StoryBuilder } from './components/StoryBuilder';
import { useDataStore } from './stores/useDataStore';
import { RotateCcw } from 'lucide-react';

function App() {
  const { view, reset, profile } = useDataStore();

  return (
    <div className="h-screen flex flex-col bg-stone-50">
      {/* Top bar */}
      <header className="h-14 border-b border-stone-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <h1 className="text-lg font-semibold text-stone-800 tracking-tight">DataMuse</h1>
        </div>

        {profile && (
          <button
            onClick={reset}
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 px-3 py-1.5 rounded-lg hover:bg-stone-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New dataset
          </button>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {view === 'upload' && <UploadZone />}
        {view === 'explore' && <InteractiveDashboard />}
        {view === 'story' && <StoryBuilder />}

        {/* Companion panel (always visible except on upload) */}
        {view !== 'upload' && <CompanionPanel />}
      </div>
    </div>
  );
}

export default App;
```

---

## Task 14: Integration Testing & Sample Data

**Files:**
- Create: `sample_data/sales_sample.csv`

**Step 1: Create sample CSV for testing**

`sample_data/sales_sample.csv`:
```csv
date,region,product,category,revenue,units_sold,profit_margin
2023-01-15,North,Widget A,Electronics,15000,120,0.25
2023-01-15,South,Widget B,Electronics,12000,95,0.22
2023-01-15,East,Gadget X,Home,8500,200,0.35
2023-01-15,West,Gadget Y,Home,9200,180,0.30
2023-02-15,North,Widget A,Electronics,16500,135,0.26
2023-02-15,South,Widget B,Electronics,11000,88,0.20
2023-02-15,East,Gadget X,Home,9000,210,0.34
2023-02-15,West,Gadget Y,Home,10500,195,0.32
2023-03-15,North,Widget A,Electronics,18000,150,0.28
2023-03-15,South,Widget B,Electronics,13500,105,0.23
2023-03-15,East,Gadget X,Home,7500,175,0.33
2023-03-15,West,Gadget Y,Home,11000,200,0.31
2023-04-15,North,Widget A,Electronics,14000,110,0.24
2023-04-15,South,Widget B,Electronics,15500,120,0.25
2023-04-15,East,Gadget X,Home,10000,230,0.36
2023-04-15,West,Gadget Y,Home,8800,165,0.29
```

**Step 2: Full integration test**

```bash
# Terminal 1: Start Qdrant
docker-compose up -d

# Terminal 2: Start backend
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 3: Start frontend
cd frontend
npm run dev

# Test: Open http://localhost:5173, drag sample CSV, verify:
# 1. File uploads and profiling completes
# 2. Muse welcome message appears in chat
# 3. AI suggestions appear on canvas
# 4. Clicking a suggestion shows full chart
# 5. Typing a question in chat gets a response
# 6. Asking for a visualization generates an inline chart
# 7. "Build Story" generates chapters with narratives and charts
```

---

## Task 15: Polish & Error Handling

**Files:**
- Modify: Various frontend components
- Create: `frontend/src/components/ErrorBoundary.tsx`

**Step 1: Add error boundary**

```tsx
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center">
            <p className="text-stone-600 font-medium mb-2">Something went wrong</p>
            <p className="text-sm text-stone-400 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Step 2: Add loading states and gentle error messages throughout components**

Ensure all API calls have try/catch with user-friendly messages (no technical jargon).

---

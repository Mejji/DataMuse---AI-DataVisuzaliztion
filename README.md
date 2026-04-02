# DataMuse

AI-powered data visualization and storytelling tool. Upload a CSV, chat with **Muse** (your friendly data analyst), and build chapter-based data stories — no technical skills required.

![DataMuse Landing](https://img.shields.io/badge/status-MVP-blueviolet) ![Python](https://img.shields.io/badge/python-3.11+-blue) ![React](https://img.shields.io/badge/react-18-61dafb)

## Features

- **CSV Upload & Profiling** — drag-and-drop upload with automatic column analysis
- **Chat with Muse** — conversational AI analyst that runs real queries on your data, generates charts, and explains findings in plain language
- **Interactive Dashboard** — accumulating multi-panel dashboard that builds as you explore
- **Story Builder** — AI-drafted data stories with chapters, narratives, and embedded visualizations
- **RAG-powered Context** — Qdrant vector DB indexes your data for accurate, grounded answers

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts, Zustand |
| Backend | Python, FastAPI, Pandas, SentenceTransformers |
| LLM | Groq (Llama 3.3 70B) with function calling |
| Vector DB | Qdrant (Docker) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker

### 1. Clone & configure

```bash
git clone <repo-url>
cd AI-Visualization
cp .env.example backend/.env
# Edit backend/.env and add your Groq API key
```

### 2. Start Qdrant

```bash
docker compose up -d
```

### 3. Backend

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and upload a CSV to get started.

## Project Structure

```
AI-Visualization/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Environment configuration
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── upload.py        # CSV upload + profiling
│   │   │   ├── chat.py          # Chat with Muse
│   │   │   ├── analyze.py       # AI visualization suggestions
│   │   │   └── story.py         # Story generation
│   │   └── services/
│   │       ├── llm_service.py   # Groq client + function calling loop
│   │       ├── muse_prompts.py  # System prompt + analytical knowledge
│   │       ├── data_tools.py    # query_data, create_chart, compute_stats, detect_patterns
│   │       ├── csv_profiler.py  # DataFrame profiling
│   │       ├── embeddings.py    # SentenceTransformer + chunking
│   │       └── qdrant_service.py # Qdrant vector operations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main app shell (upload/explore/story views)
│   │   ├── components/
│   │   │   ├── UploadZone.tsx         # Drag-and-drop CSV upload
│   │   │   ├── CompanionPanel.tsx     # Muse chat side panel
│   │   │   ├── ChatMessage.tsx        # Message bubble with inline chart
│   │   │   ├── ChartRenderer.tsx      # Dynamic Recharts renderer
│   │   │   ├── InteractiveDashboard.tsx # Multi-panel dashboard
│   │   │   ├── DashboardPanel.tsx     # Individual dashboard panel
│   │   │   ├── SuggestionCard.tsx     # Clickable suggestion previews
│   │   │   ├── StoryBuilder.tsx       # Story generation UI
│   │   │   ├── StoryChapter.tsx       # Editable chapter card
│   │   │   └── ErrorBoundary.tsx      # Error boundary
│   │   ├── lib/api.ts           # Axios API client
│   │   └── stores/useDataStore.ts # Zustand state management
│   └── package.json
├── docker-compose.yml           # Qdrant container
├── sample_data/
│   └── sales_sample.csv         # Example dataset
├── .env.example                 # Environment template
└── .gitignore
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/upload` | Upload CSV file |
| `POST` | `/api/chat` | Chat with Muse |
| `GET` | `/api/analyze/{id}` | Get visualization suggestions |
| `POST` | `/api/story/generate` | Generate data story |
| `POST` | `/api/story/save` | Save edited story |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key ([console.groq.com](https://console.groq.com)) | — |
| `GROQ_MODEL` | LLM model name | `llama-3.3-70b-versatile` |
| `QDRANT_HOST` | Qdrant hostname | `localhost` |
| `QDRANT_PORT` | Qdrant port | `6333` |

## License

MIT

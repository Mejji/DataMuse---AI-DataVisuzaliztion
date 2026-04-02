# DataMuse

AI-powered data visualization and storytelling tool. Upload a CSV, chat with **Muse** (your friendly data analyst), and build chapter-based data stories — no technical skills required.

![DataMuse Landing](https://img.shields.io/badge/status-MVP-blueviolet) ![Python](https://img.shields.io/badge/python-3.11+-blue) ![React](https://img.shields.io/badge/react-18-61dafb)

## Features

- **CSV Upload & Profiling** — drag-and-drop upload with automatic column analysis
- **Chat with Muse** — conversational AI analyst that runs real queries on your data, generates charts, and explains findings in plain language
- **Interactive Dashboard** — accumulating multi-panel dashboard that builds as you explore
- **Story Builder** — AI-drafted data stories with chapters, narratives, and embedded visualizations
- **RAG-powered Context** — Qdrant vector DB indexes your data for accurate, grounded answers
- **Smart Load Balancer** — round-robin rotation across 5 Groq free-tier models with automatic 429 failover (~18K+ requests/day)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts, Zustand |
| Backend | Python, FastAPI, Pandas, SentenceTransformers |
| LLM | Groq (Llama 3.3 70B, Kimi K2, Qwen3 32B, Llama 4 Scout, Llama 3.1 8B) — load-balanced |
| Vector DB | Qdrant (Docker) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker

### One-Command Start

After initial setup (see below), start everything with:

```bash
# Windows
start.bat

# macOS/Linux
chmod +x start.sh
./start.sh
```

This starts Qdrant (Docker), the backend API server, and the frontend dev server automatically.

### Initial Setup (First Time Only)

#### 1. Clone & configure

```bash
git clone <repo-url>
cd AI-Visualization
cp .env.example backend/.env
# Edit backend/.env and add your Groq API key
```

#### 2. Install backend dependencies

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r backend/requirements.txt
```

#### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

#### 4. Run

```bash
# From project root — starts everything
# Windows
start.bat
# macOS/Linux
./start.sh
```

Open **http://localhost:5173** and upload a CSV to get started.

## LLM Load Balancer

DataMuse uses a **smart load balancer** that rotates across multiple Groq free-tier models. Each model has independent rate limits, so combining them gives you a much larger daily request pool:

| Model | Requests/Day | Tokens/Day |
|-------|-------------|-----------|
| `llama-3.3-70b-versatile` | 1,000 | 100,000 |
| `moonshotai/kimi-k2-instruct` | 1,000 | 300,000 |
| `qwen/qwen3-32b` | 1,000 | 500,000 |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 1,000 | 500,000 |
| `llama-3.1-8b-instant` | 14,400 | 500,000 |
| **Combined** | **~18,400** | **~1,900,000** |

**How it works:**
- Round-robin rotation: each request goes to the next model in the pool
- On a 429 (rate limit), that model is marked exhausted and the next one is tried
- Thread-safe: works correctly under concurrent requests
- Resets on server restart

## Project Structure

```
AI-Visualization/
├── start.bat                    # Windows launcher (one-click start)
├── start.sh                     # macOS/Linux launcher
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Environment + model pool configuration
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── upload.py        # CSV upload + profiling
│   │   │   ├── chat.py          # Chat with Muse
│   │   │   ├── analyze.py       # AI visualization suggestions
│   │   │   └── story.py         # Story generation
│   │   └── services/
│   │       ├── llm_service.py   # Load-balanced Groq client + function calling
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
| `QDRANT_HOST` | Qdrant hostname | `localhost` |
| `QDRANT_PORT` | Qdrant port | `6333` |

## License

MIT

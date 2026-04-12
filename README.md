# DataMuse

AI-powered data visualization and storytelling tool. Upload a CSV, chat with **Muse** (your friendly data analyst), and build chapter-based data stories — no technical skills required.

![DataMuse Landing](https://img.shields.io/badge/status-MVP-blueviolet) ![Python](https://img.shields.io/badge/python-3.11+-blue) ![React](https://img.shields.io/badge/react-18-61dafb)

## Features

- **CSV Upload & Profiling** — drag-and-drop upload with automatic column analysis
- **Chat with Muse** — conversational AI analyst that runs real queries on your data, generates charts, and explains findings in plain language
- **Interactive Dashboard** — accumulating multi-panel dashboard that builds as you explore
- **Story Builder** — AI-drafted data stories with chapters, narratives, and embedded visualizations
- **RAG-powered Context** — Qdrant vector DB indexes your data for accurate, grounded answers
- **Tiered Model Router** — complexity-based routing across 8 models from 3 providers (Groq, Cerebras, Gemini) — strong models for charts and analytics, fast models for simple questions (~47K+ requests/day)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts, Zustand |
| Backend | Python, FastAPI, Pandas, SentenceTransformers |
| LLM | Groq, Cerebras, Google Gemini — 8 models, tiered complexity routing |
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
# Edit backend/.env and add your API keys (Groq, Cerebras, Gemini)
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

## LLM Model Router

DataMuse uses a **tiered model router** that matches request complexity to the right model. Instead of blind round-robin, each user message is classified into a complexity tier, and the router selects from models best suited for that tier. This maximizes model utilization — strong models handle charts and analytics, fast models handle simple questions.

### Complexity Tiers

| Tier | Role | Models | When Used |
|------|------|--------|-----------|
| **1 — Strong** | Reliable tool calling, complex reasoning, long output | `llama-3.3-70b-versatile`, `qwen-3-235b`, `gemini-2.5-flash` | Chart generation, analytics, correlations, stories, data mutations |
| **2 — Mid** | Decent quality, good throughput | `kimi-k2-instruct`, `qwen3-32b`, `llama-4-scout-17b` | General conversation, moderate questions |
| **3 — Fast** | Lightweight, high RPD | `llama-3.1-8b-instant`, `llama3.1-8b` | "What columns?", "How many rows?", greetings |

### Routing Examples

| User Message | Tier | Why |
|---|---|---|
| "Show me a bar chart of sales by region" | 1 | Needs reliable tool calling |
| "What correlates with revenue?" | 1 | Complex analytical reasoning |
| "Remove outliers from price column" | 1 | Data mutation (high stakes) |
| "Generate a story about the data" | 1 | Long narrative output |
| "What's the average price per category?" | 2 | Moderate question, no tool calling needed |
| "Tell me about the dataset" | 2 | General conversation |
| "What columns are there?" | 3 | Trivial metadata lookup |
| "How many rows?" | 3 | Trivial metadata lookup |
| "Hello" | 3 | Greeting |

### Model Pool

| Tier | Provider | Model | Requests/Day | Tokens/Day |
|------|----------|-------|-------------|-----------|
| 1 | Groq | `llama-3.3-70b-versatile` | 1,000 | 100,000 |
| 1 | Cerebras | `qwen-3-235b-a22b-instruct-2507` | 14,400 | 1,000,000 |
| 1 | Gemini | `gemini-2.5-flash` | 250 | 250,000 TPM |
| 2 | Groq | `moonshotai/kimi-k2-instruct` | 1,000 | 300,000 |
| 2 | Groq | `qwen/qwen3-32b` | 1,000 | 500,000 |
| 2 | Groq | `meta-llama/llama-4-scout-17b-16e-instruct` | 1,000 | 500,000 |
| 3 | Groq | `llama-3.1-8b-instant` | 14,400 | 500,000 |
| 3 | Cerebras | `llama3.1-8b` | 14,400 | 1,000,000 |
| | **Combined: 8 models** | | **~47,450** | **~4,150,000** |

### How It Works

1. **Complexity classification**: each user message is classified into a tier (1/2/3) using a zero-latency regex classifier — no extra LLM call
2. **Tier-aware round-robin**: the router picks from the matching tier's pool, rotating across models to distribute rate limits
3. **Automatic escalation**: if all models in a tier are rate-limited, the router escalates to the next stronger tier (3 → 2 → 1)
4. **Tier pinning**: conversations pin to a tier and only upgrade — if a user starts with "hello" (tier 3) then asks "show me a chart" (tier 1), the conversation upgrades to tier 1 for the rest of the session
5. **Model pinning**: within a tier, the router pins to a specific model for conversation coherence
6. **429 failover**: on rate limit, that model is marked exhausted with a 60-second TTL cooldown
7. **TPM handling**: tokens-per-minute errors trigger context trimming and retry on the same model
8. **`tool_use_failed` recovery**: failover to the next model while preserving tool calling
9. **`<think>` stripping**: chain-of-thought tags from reasoning models are automatically cleaned
10. **Thread-safe**: works correctly under concurrent requests

### Fixed-Tier Endpoints

Some endpoints always use tier 1 regardless of user input:
- **Visualization suggestions** (`/api/analyze`) — needs reliable JSON output
- **Story generation** (`/api/story/generate`) — needs strong reasoning + long narrative

### Upgrading to Premium Models

By default, DataMuse uses **free-tier APIs** (Groq, Cerebras, Gemini free tier) to keep running costs at $0. If you want higher quality, faster responses, or higher rate limits, you can swap in paid models — it's a one-file change.

**File to edit:** `backend/app/config.py` → `MODEL_POOL`

Each entry is a `ModelEntry(provider, model_name, tier)`. Just replace the model string:

```python
# backend/app/config.py

MODEL_POOL: list[ModelEntry] = [
    # --- Tier 1: Strong ---
    # Free default → GPT-4o (OpenAI)
    ModelEntry("openai",   "gpt-4o",                    tier=1),
    # Free default → Claude Opus 4 (Anthropic)
    ModelEntry("anthropic","claude-opus-4-5",            tier=1),
    # Keep Gemini 2.5 Pro instead of Flash for best quality
    ModelEntry("gemini",   "gemini-2.5-pro",             tier=1),

    # --- Tier 2: Mid ---
    ModelEntry("openai",   "gpt-4o-mini",               tier=2),
    ModelEntry("anthropic","claude-haiku-3-5",           tier=2),

    # --- Tier 3: Fast ---
    ModelEntry("openai",   "gpt-4o-mini",               tier=3),
    ModelEntry("groq",     "llama-3.1-8b-instant",      tier=3),
]
```

**Supported providers and their `.env` keys:**

| Provider | Models | Env Key | Pricing |
|----------|--------|---------|---------|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `o3`, `o4-mini` | `OPENAI_API_KEY` | [openai.com/pricing](https://openai.com/pricing) |
| **Anthropic** | `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-3-5` | `ANTHROPIC_API_KEY` | [anthropic.com/pricing](https://anthropic.com/pricing) |
| **Google Gemini** | `gemini-2.5-pro`, `gemini-2.5-flash` | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) |
| **Groq** | Any model on [console.groq.com/docs/models](https://console.groq.com/docs/models) | `GROQ_API_KEY` | Paid tiers available |

> **OpenAI and Anthropic are not wired up by default** — to add them, install the SDKs (`pip install openai anthropic`) and add a matching `elif entry.provider == "openai"` / `elif entry.provider == "anthropic"` branch in the `_call_model()` function in `backend/app/services/llm_service.py`. The Gemini, Groq, and Cerebras integrations are already fully implemented and can be upgraded just by changing the model name string.

**Best bang-for-buck recommendations:**
- **Tightest budget:** Keep the free defaults — they're already strong (Qwen-3 235B, Gemini 2.5 Flash)
- **Small spend:** Upgrade tier 1 to `gemini-2.5-pro` (swap `gemini-2.5-flash` → `gemini-2.5-pro` — same provider, no code change)
- **Best quality:** GPT-4o for tier 1 + GPT-4o-mini for tiers 2/3 (requires OpenAI SDK + `_call_model` branch)
- **Best quality + speed:** Claude Sonnet 4.5 for tier 1, Claude Haiku 3.5 for tiers 2/3

## Project Structure

```
AI-Visualization/
├── start.bat                    # Windows launcher (one-click start)
├── start.sh                     # macOS/Linux launcher
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Environment, model pool + tier config, complexity classifier
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── upload.py        # CSV upload + profiling
│   │   │   ├── chat.py          # Chat with Muse
│   │   │   ├── analyze.py       # AI visualization suggestions
│   │   │   └── story.py         # Story generation
│   │   └── services/
│   │       ├── llm_service.py   # Tiered model router + function calling
│   │       ├── muse_prompts.py  # System prompt + analytical knowledge
│   │       ├── data_tools.py    # query_data, create_chart, create_table, compute_stats, detect_patterns
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
| `CEREBRAS_API_KEY` | Cerebras API key ([cloud.cerebras.ai](https://cloud.cerebras.ai)) | — |
| `GEMINI_API_KEY` | Google Gemini API key ([aistudio.google.com](https://aistudio.google.com)) | — |
| `QDRANT_HOST` | Qdrant hostname | `localhost` |
| `QDRANT_PORT` | Qdrant port | `6333` |

## Security Notice

DataMuse is designed for **local and internal use** by default. The included start scripts run development servers suitable for personal use and experimentation.

If you plan to deploy DataMuse on a public network, you **must** configure:

- **CORS origins** — update the allowed origins in `backend/app/main.py` to match your production domain
- **HTTPS/TLS** — use a reverse proxy (e.g., nginx, Caddy) with a valid certificate
- **Rate limiting** — add rate limiting on `/api/upload` and `/api/chat` endpoints
- **Authentication** — add an authentication layer; DataMuse does not include built-in auth

See [SECURITY.md](SECURITY.md) for the full security policy and vulnerability reporting instructions.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to report bugs, suggest features, and submit pull requests.

## License

GPL-3.0 — see [LICENSE](LICENSE) for details.

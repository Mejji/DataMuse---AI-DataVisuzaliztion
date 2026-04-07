import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ dir or project root
_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")


# ---------------------------------------------------------------------------
# Provider-aware model pool
#
# Each entry pairs a provider tag with a model name.  The load balancer
# dispatches to the correct client (Groq, Cerebras, or Gemini) based on
# the provider field.  Failover order = list order.
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class ModelEntry:
    provider: str   # "groq" | "cerebras" | "gemini"
    model: str      # model name string for that provider's API


# Order: Groq primary → Cerebras secondary → Gemini last-resort
MODEL_POOL: list[ModelEntry] = [
    # --- Groq (5 models, ~18K RPD combined) ---
    ModelEntry("groq", "llama-3.3-70b-versatile"),
    ModelEntry("groq", "moonshotai/kimi-k2-instruct"),
    ModelEntry("groq", "qwen/qwen3-32b"),
    ModelEntry("groq", "meta-llama/llama-4-scout-17b-16e-instruct"),
    ModelEntry("groq", "llama-3.1-8b-instant"),
    # --- Cerebras (2 models, ~29K RPD combined) ---
    ModelEntry("cerebras", "llama3.1-8b"),
    ModelEntry("cerebras", "qwen-3-235b-a22b-instruct-2507"),
    # --- Gemini (last resort, 250 RPD but massive context) ---
    ModelEntry("gemini", "gemini-2.5-flash"),
]


class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    CEREBRAS_API_KEY: str = os.getenv("CEREBRAS_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    MODEL_POOL: list[ModelEntry] = MODEL_POOL
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    MAX_CSV_ROWS: int = 50000
    MAX_CSV_SIZE_MB: int = 50


settings = Settings()

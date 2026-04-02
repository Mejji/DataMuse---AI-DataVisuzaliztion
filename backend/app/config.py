import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ dir or project root
_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")


# Groq model pool — each model has independent rate limits on the free tier.
# Round-robin across them gives ~18K+ requests/day combined.
GROQ_MODEL_POOL: list[str] = [
    "llama-3.3-70b-versatile",              # 1K RPD, 100K TPD — best quality
    "moonshotai/kimi-k2-instruct",           # 1K RPD, 300K TPD — strong reasoning
    "qwen/qwen3-32b",                        # 1K RPD, 500K TPD — fast, capable
    "meta-llama/llama-4-scout-17b-16e-instruct",  # 1K RPD, 500K TPD — good balance
    "llama-3.1-8b-instant",                  # 14.4K RPD, 500K TPD — lightweight fallback
]


class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL_POOL: list[str] = GROQ_MODEL_POOL
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    MAX_CSV_ROWS: int = 50000
    MAX_CSV_SIZE_MB: int = 50


settings = Settings()

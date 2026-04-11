import os
import re
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ dir or project root
_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")


# ---------------------------------------------------------------------------
# Provider-aware model pool with capability tiers
#
# Each entry pairs a provider tag with a model name and a capability tier.
# The load balancer dispatches to the correct client (Groq, Cerebras, or
# Gemini) based on the provider field.  Model selection is tier-aware:
# complex tasks get strong models, simple tasks get fast ones.
#
# Tiers:
#   1 = Strong   — best reasoning, reliable tool calling, long output
#   2 = Mid      — decent quality, good throughput
#   3 = Fast     — lightweight, high RPD, simple questions only
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class ModelEntry:
    provider: str   # "groq" | "cerebras" | "gemini"
    model: str      # model name string for that provider's API
    tier: int = 2   # 1=strong, 2=mid, 3=fast


MODEL_POOL: list[ModelEntry] = [
    # --- Tier 1: Strong (reliable tool calling, complex reasoning) ---
    ModelEntry("groq",     "llama-3.3-70b-versatile",                tier=1),
    ModelEntry("cerebras", "qwen-3-235b-a22b-instruct-2507",        tier=1),
    ModelEntry("gemini",   "gemini-2.5-flash",                       tier=1),
    # --- Tier 2: Mid (decent quality, good throughput) ---
    ModelEntry("groq",     "moonshotai/kimi-k2-instruct",            tier=2),
    ModelEntry("groq",     "qwen/qwen3-32b",                         tier=2),
    ModelEntry("groq",     "meta-llama/llama-4-scout-17b-16e-instruct", tier=2),
    # --- Tier 3: Fast (simple questions, high RPD) ---
    ModelEntry("groq",     "llama-3.1-8b-instant",                   tier=3),
    ModelEntry("cerebras", "llama3.1-8b",                            tier=3),
]


# ---------------------------------------------------------------------------
# Complexity classifier
#
# Determines the minimum tier needed for a user message.  Returns 1, 2, or 3.
# This is intentionally rule-based (no extra LLM call) for zero latency.
# ---------------------------------------------------------------------------

# Tier 1 triggers: needs strong reasoning or reliable tool calling
_TIER1_PATTERNS = re.compile(
    r'\b('
    # Visualization / charting (needs reliable tool calling)
    r'(?:show|create|make|generate|build|draw|render|display|give\s+me)\s+(?:a\s+|the\s+)?(?:chart|graph|plot|visual|visualization|diagram)'
    r'|(?:pie|bar|line|area|scatter|histogram|heatmap|treemap|funnel|radar|waterfall|candlestick|donut|bubble|box\s*plot)\s+(?:chart|graph|plot)?'
    r'|visuali[sz]e'
    # Analytical reasoning
    r'|(?:correlat(?:e|es|ed|ion|ions)?|regress(?:ion)?|predict|forecast|trend|pattern|anomal(?:y|ies|ous)?|outlier|cluster|segment)'
    r'|(?:compare|comparison|versus|vs\.?)\s+\w+'
    r'|(?:why|explain|what\s+(?:caused|drives|explains|factors|affects))'
    r'|(?:statistic|significance|confidence|p[\s-]?value|standard\s+deviation|variance)'
    # Story / narrative generation
    r'|(?:story|narrative|report|summary|insight|finding|conclusion|recommend)'
    # Data mutation (high stakes)
    r'|(?:remove|delete|drop|fill|replace|rename|convert|transform|clean|fix)\s+(?:the\s+)?(?:column|row|missing|null|outlier|duplicate|data)'
    r'|(?:remove|delete|drop|fill)\s+\w+\s+(?:from|in)\s+'
    r')\b',
    re.IGNORECASE,
)

# Tier 3 triggers: simple/trivial questions
_TIER3_PATTERNS = re.compile(
    r'(?:'
    r'\b(?:what|which|list|show\s+me)\s+(?:are\s+)?(?:the\s+)?(?:columns?|fields?|headers?|features?|variables?)\b'
    r'|\b(?:how\s+many)\s+(?:rows?|records?|entries?|columns?|data\s+points?)\b'
    r'|\b(?:what|which)\s+(?:type|dtype|format)\s+'
    r'|\b(?:describe|overview|shape|size|dimensions?)\s*(?:of)?\s*(?:the)?\s*(?:data|dataset|table)?\s*$'
    r'|^\s*(?:hello|hi|hey|thanks|thank\s+you|ok|okay|got\s+it|sure)\s*[.!?]*\s*$'
    r')',
    re.IGNORECASE,
)


def classify_complexity(user_message: str) -> int:
    """Classify a user message into a complexity tier (1=strong, 2=mid, 3=fast).

    Returns the minimum tier number needed to handle the request well.
    """
    if not user_message or not user_message.strip():
        return 3

    # Check tier 1 first (strong model needed)
    if _TIER1_PATTERNS.search(user_message):
        return 1

    # Check tier 3 (trivial question)
    if _TIER3_PATTERNS.search(user_message):
        return 3

    # Default: mid-tier handles most conversational / moderate questions
    return 2


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

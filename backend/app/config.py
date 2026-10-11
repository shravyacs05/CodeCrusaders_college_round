"""Configuration via environment variables and optional .env file."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    # Look for .env in backend/ or root
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

DATA_DIR = Path(os.getenv("CRISISGRID_DATA", Path(__file__).resolve().parents[2] / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Provider detection: supports "gemini", "google", "anthropic", "openai", or "none"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").strip().lower()
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip() or os.getenv("GEMINI_API_KEY", "").strip()

if not LLM_PROVIDER:
    if os.getenv("GEMINI_API_KEY"):
        LLM_PROVIDER = "gemini"
    else:
        LLM_PROVIDER = "none"

if LLM_PROVIDER in ("gemini", "google"):
    LLM_MODEL = os.getenv("LLM_MODEL", "gemini-flash-latest").strip()
else:
    LLM_MODEL = os.getenv("LLM_MODEL", "").strip()

TOLERANCE_PP = float(os.getenv("TOLERANCE_PP", "1.0"))  # percentage points
RUN_TIMEOUT_S = int(os.getenv("RUN_TIMEOUT_S", "300"))
SETUP_TIMEOUT_S = int(os.getenv("SETUP_TIMEOUT_S", "900"))
CHECKPOINT_MAX_GB = float(os.getenv("CHECKPOINT_MAX_GB", "5"))  # refuse to auto-download larger checkpoints

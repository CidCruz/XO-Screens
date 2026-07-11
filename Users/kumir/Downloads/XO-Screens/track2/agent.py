# ── Config ───────────────────────────────────────────────────────────────────

# Load .env only for local development (not in the submitted Docker container)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Don't use hardcoded keys that might not work in evaluation environment
_HARDCODED_FW_KEY = None  # Removed hardcoded key to force user to provide their own
_HARDCODED_GEMINI_KEY = None  # Removed hardcoded key to force user to provide their own

API_KEY      = os.environ.get("FIREWORKS_API_KEY", "").strip()
GEMINI_KEY   = os.environ.get("GEMINI_API_KEY", "").strip()
BASE_URL     = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1").rstrip("/")
GEMINI_BASE  = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL = "gemini-2.5-flash"

# Session-level flag: once Gemini quota is hit, skip it for remaining tasks
_gemini_quota_hit = False

def gemini_available() -> bool:
    return bool(GEMINI_KEY) and not _gemini_quota_hit
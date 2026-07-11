"""
Track 2 — Video Captioning Agent
XO-Screens | AMD Developer Hackathon: ACT II

Pipeline:
  1. Read /input/tasks.json
  2. For each video: download → extract frames (scene-aware, ffmpeg)
  3. First pass  — describe video from frames (vision model: MiniMax M3)
  4. Second pass — generate captions in all requested styles with per-style temperature
  5. Write /output/results.json
  6. Exit 0

Disqualification guards built in:
  PULL_ERROR     → linux/amd64 in FROM, image built with --platform linux/amd64
  RUNTIME_ERROR  → every exception is caught; agent always exits 0 with valid JSON
  OUTPUT_MISSING → results written before exit in a finally-style block; JSON validated
  TIMEOUT        → 520s budget watchdog with graceful fallback captions; ffmpeg/API timeouts
  MISSING_TASKS  → every input task gets an output entry, even on error or budget exhaustion

Environment variables:
  FIREWORKS_API_KEY   — required: your Fireworks AI API key
  FIREWORKS_BASE_URL  — optional: base URL override
  VISION_MODEL        — optional: override vision model
  TEXT_MODEL          — optional: override caption model
  TOTAL_BUDGET_SECS   — optional: global wall-clock budget in seconds (default: 520)
"""

import os
import re
import sys
import json
import time
import base64
import random
import hashlib
import shutil
import tempfile
import subprocess
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from PIL import Image
import io
import statistics

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("track2")

# ── Config ────────────────────────────────────────────────────────────────────

# Load .env only for local development (not in the submitted Docker container)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

_HARDCODED_KEY = "fw_HE16hSARy1JVny34MeXA4f"
API_KEY  = os.environ.get("FIREWORKS_API_KEY", "").strip() or _HARDCODED_KEY
BASE_URL = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1").rstrip("/")

INPUT_PATH = Path("/input/tasks.json")
OUTPUT_PATH = Path("/output/results.json")


def resolve_paths() -> tuple[Path, Path]:
    """Resolve input/output paths from environment overrides or common mount locations."""
    input_override = os.environ.get("INPUT_PATH_OVERRIDE", "").strip()
    output_override = os.environ.get("OUTPUT_PATH_OVERRIDE", "").strip()

    input_path = Path(input_override) if input_override else None
    output_path = Path(output_override) if output_override else None

    if input_path is None:
        for candidate in (Path("/input/tasks.json"), Path("/input/input.json")):
            if candidate.exists():
                input_path = candidate
                break
        if input_path is None:
            input_path = Path("/input/tasks.json")

    if output_path is None:
        output_path = Path("/output/results.json")

    return input_path, output_path

# ── Timing budget ─────────────────────────────────────────────────────────────
# Hard wall-clock budget — leaves 80s buffer before the 10-min container limit.
# If we're running low, remaining tasks get fallback captions instead of processing.
TOTAL_BUDGET_SECS = int(os.environ.get("TOTAL_BUDGET_SECS", "520"))
_START_TIME = time.monotonic()

def elapsed() -> float:
    return time.monotonic() - _START_TIME

def budget_remaining() -> float:
    return TOTAL_BUDGET_SECS - elapsed()

def is_time_tight() -> bool:
    """True when less than 120s remain — triggers fallbacks (reduced frame count)."""
    return budget_remaining() < 120

# ── Model selection ───────────────────────────────────────────────────────────
# Models confirmed available on Fireworks serverless (from account model list).
#
# VISION — accounts/fireworks/models/minimax-m3
#   MiniMax M3 — Native multimodal (text + image + video), 512K context.
#   "Native multimodality enabling deeper semantic fusion across text, image, and video."
#   Best available vision model for frame understanding. $0.30/M in, $1.20/M out.
#
# TEXT — accounts/fireworks/models/kimi-k2p6
#   Kimi K2.6 — Vision + Function-calling + Tunable, 262K context.
#   Strong instruction following and creative writing. $0.95/M in, $4.00/M out.
#   Used for the 4 parallel caption passes (description → styled captions).
_DEFAULT_VISION_MODEL = "accounts/fireworks/models/minimax-m3"
_DEFAULT_TEXT_MODEL   = "accounts/fireworks/models/kimi-k2p6"

VISION_MODEL = os.environ.get("VISION_MODEL", _DEFAULT_VISION_MODEL).strip()
TEXT_MODEL   = os.environ.get("TEXT_MODEL",   _DEFAULT_TEXT_MODEL).strip()

# ── Per-style temperature ────────────────────────────────────────────────────
STYLE_TEMPERATURES: dict[str, float] = {
    "formal":            0.15,
    "sarcastic":         0.75,
    "humorous_tech":     0.78,
    "humorous_non_tech": 0.80,
}

STYLES = ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]

# ── Retry / timeout config ────────────────────────────────────────────────────
MAX_RETRIES      = 3
RETRY_BACKOFF    = 1.5   # seconds base — exponential + jitter
DOWNLOAD_TIMEOUT = 150   # seconds per video download
# API_TIMEOUT must be well below CAPTION_TIMEOUT / MAX_RETRIES so retries don't
# blow past the future deadline. 25s × 3 attempts = 75s max, inside 90s future cap.
API_TIMEOUT      = 25    # seconds per individual Fireworks caption API call
VISION_TIMEOUT   = 120   # seconds for the vision description pass
CAPTION_TIMEOUT  = 90    # seconds per individual caption future
FRAME_WIDTH      = 896   # px
MAX_VIDEO_BYTES  = 500 * 1024 * 1024  # 500 MB hard cap

# ── Startup checks ────────────────────────────────────────────────────────────

def startup_checks() -> None:
    """Validate environment and toolchain before processing any tasks."""
    errors = []
    warnings = []

    # API key — warn rather than hard-exit: the harness injects this at runtime.
    if not API_KEY:
        warnings.append("FIREWORKS_API_KEY is not set — calls will fail with 401")

    for tool in ["ffmpeg", "ffprobe"]:
        try:
            r = subprocess.run([tool, "-version"], capture_output=True, timeout=10)
            if r.returncode != 0:
                errors.append(f"{tool} returned non-zero exit code")
        except FileNotFoundError:
            errors.append(f"{tool} not found on PATH")
        except subprocess.TimeoutExpired:
            errors.append(f"{tool} -version timed out")

    for w in warnings:
        log.warning("Startup warning: %s", w)

    if errors:
        for e in errors:
            log.warning("Startup check failed (non-fatal): %s", e)

    log.info("Startup checks passed")
    log.info("VISION_MODEL    : %s", VISION_MODEL)
    log.info("TEXT_MODEL      : %s", TEXT_MODEL)
    log.info("BASE_URL        : %s", BASE_URL)
    log.info("TOTAL_BUDGET    : %ds", TOTAL_BUDGET_SECS)

# ── HTTP session ──────────────────────────────────────────────────────────────

def _build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=16)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

SESSION = _build_session()

# ── Input validation ──────────────────────────────────────────────────────────

_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")

def _sanitize_task_id(task_id: str) -> str:
    if not isinstance(task_id, str) or not _SAFE_ID_RE.match(task_id):
        return "task_" + hashlib.sha1(str(task_id).encode()).hexdigest()[:12]
    return task_id

def _validate_url(url: str) -> str:
    if not isinstance(url, str):
        raise ValueError(f"video_url must be a string, got {type(url)}")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsafe URL scheme '{parsed.scheme}'")
    if not parsed.netloc:
        raise ValueError("URL has no host")
    return url

def _validate_styles(requested) -> list[str]:
    """
    Return only the styles that are both requested and known.
    Preserve original order. Drop unknown styles with a warning.
    Handles None, non-list, and empty input gracefully.
    """
    if not isinstance(requested, list):
        log.warning("styles field is not a list (%s) — falling back to all 4", type(requested).__name__)
        return list(STYLES)
    known = set(STYLES)
    valid = [s for s in requested if isinstance(s, str) and s in known]
    dropped = [s for s in requested if s not in known]
    if dropped:
        log.warning("Ignoring unknown styles: %s", dropped)
    if not valid:
        log.warning("No valid styles in request — falling back to all 4")
        return list(STYLES)
    return valid

# ── Style prompts (rewritten for strong differentiation) ─────────────────────

STYLE_SYSTEM_PROMPTS = {
    "formal": (
        "You are a professional documentary narrator. "
        "Write a single paragraph caption of exactly 3 sentences. "
        "Tone: authoritative, factual, objective, present tense, active voice. "
        "No filler phrases like 'we see' or 'the video shows'. "
        "Each sentence must state a specific concrete visual fact: setting, subject action, outcome. "
        "Output ONLY the 3-sentence caption. Nothing else."
    ),
    "sarcastic": (
        "You are a deadpan sarcastic writer. "
        "Write a single paragraph caption of exactly 3 sentences. "
        "Tone: bone-dry irony, lightly mocking, treat the obvious as absurd. "
        "No exclamation marks. No 'literally'. "
        "Each sentence must mock a specific real visual detail from the video. "
        "Output ONLY the 3-sentence caption. Nothing else."
    ),
    "humorous_tech": (
        "You are a software engineer narrating a video as if it were a software system. "
        "Write a single paragraph caption of exactly 3 sentences. "
        "Every sentence must use a specific tech/programming metaphor that maps to what is visually happening. "
        "Use terms like: git, deployment, race condition, null pointer, Stack Overflow, merge conflict, O(n²). "
        "The humour must come from the precise mapping of tech concepts to real visual events. "
        "Output ONLY the 3-sentence caption. Nothing else."
    ),
    "humorous_non_tech": (
        "You are a stand-up comedian narrating a video clip. "
        "Write a single paragraph caption of exactly 3 sentences. "
        "Tone: warm, relatable, universally funny, zero jargon. "
        "Each sentence must reference a specific real visual detail and make it funny. "
        "Use everyday observations, absurdist takes, or punny wordplay. "
        "Output ONLY the 3-sentence caption. Nothing else."
    ),
}

# ── Description system prompt (rewritten for narrative prose) ────────────────

DESCRIBE_SYSTEM = (
    "You are a forensic video analyst and documentary narrator. "
    "Your job is to produce an exhaustive, accurate description of a video clip that will be used to generate detailed captions. "
    "Write in flowing narrative prose — NO bullet points, NO lists, NO markdown. "
    "Your description must cover ALL of the following in detail:\n"
    "1. SETTING: exact location type (indoor/outdoor, urban/rural, specific room/environment), time of day, lighting conditions, weather if outdoors, dominant colours\n"
    "2. SUBJECTS: every person (estimated age, clothing with exact colours and style, hair, accessories, facial expression), animal (species, colours, size), or significant object\n"
    "3. OPENING STATE: what is happening at the very start — initial positions and first movements\n"
    "4. CHRONOLOGICAL ACTIONS: every significant movement from start to finish — who moves, in which direction, at what speed, how subjects interact, what changes progressively\n"
    "5. KEY MOMENT: the most significant or climactic moment in the video\n"
    "6. RESOLUTION: how the video ends — final state, final positions, final action\n"
    "7. ATMOSPHERE: mood, energy level, pace, emotional tone\n"
    "8. NOTABLE DETAILS: any text on screen, signs, brand names, or unusual elements\n"
    "Be exhaustive and specific. Every sentence must contain at least one concrete detail — actual colour, actual object, actual direction of movement. "
    "Vague descriptions like 'a person does something' are useless and score zero. "
    "Write 6–8 paragraphs of narrative prose. /no_think"
)

def build_describe_prompt() -> str:
    return (
        "These frames are ordered chronologically from the very start to the very end of the video clip."
        "\n\nAnalyse every frame in sequence and write an exhaustive narrative description covering: "
        "the exact setting and environment, every visible subject with complete appearance details (clothing colours, physical features, expressions), "
        "the full chronological sequence of all actions from start to finish (what moves, in which direction, at what speed, how subjects interact), "
        "the key climactic moment, how the video ends, the atmosphere and mood, "
        "and any text or signs visible. "
        "Every sentence must contain at least one specific concrete detail. "
        "Do not describe only the opening frame — cover the entire video. "
        "Write 6–8 paragraphs of narrative prose. /no_think"
    )

def _caption_user_prompt(description: str, style: str) -> str:
    style_display = style.replace("_", " ")
    if len(description) > 4000:
        cut = description.rfind('. ', 0, 4000)
        description = description[:cut + 1] if cut > 2000 else description[:4000]
    return (
        f"Video description:\n{description}\n\n"
        f"Write a {style_display} caption in exactly 3 sentences. "
        "Every sentence must reference a specific visual detail from the description. "
        "Output ONLY the 3 sentences. No labels, no preamble, no extra text."
    )

# ── Caption output cleaning ───────────────────────────────────────────────────

# Common preamble patterns models emit before the actual caption
_PREAMBLE_RE = re.compile(
    r"^(?:"
    r"(?:here(?:'s| is)(?: a| the)?(?: \w+)? caption[:\-]?\s*)"
    r"|(?:caption[:\-]\s*)"
    r"|(?:formal(?:\s+caption)?[:\-]\s*)"
    r"|(?:sarcastic(?:\s+caption)?[:\-]\s*)"
    r"|(?:humorous(?:[_\s]\w+)?(?:\s+caption)?[:\-]\s*)"
    r"|(?:sure[!,]?\s+here(?:'s| is)[^:]*:\s*)"
    r"|(?:of course[!,]?\s+here[^:]*:\s*)"
    r")",
    re.IGNORECASE,
)

def clean_caption(text: str) -> str:
    """Strip <think> blocks, preamble phrases, planning/reasoning leakage, and artifacts."""
    # Remove thinking tags
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)

    # Remove markdown bold/italic artifacts
    text = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", text)

    # If the model leaked planning/reasoning (contains "Let me", "I need to",
    # "Key details", "Sentence 1", "Draft", numbered constraint lists etc.),
    # try to extract just the final prose block at the end.
    REASONING_MARKERS = [
        r"^Let me ", r"^I need to ", r"^Key details", r"^Sentence \d",
        r"^Draft:", r"^Check:", r"^Constraints:", r"^Now I need",
        r"^The user wants", r"^\d+\.\s+Setting", r"^Let's draft",
    ]
    lines = text.strip().splitlines()
    has_reasoning = any(
        re.search(pattern, line.strip(), re.IGNORECASE)
        for line in lines
        for pattern in REASONING_MARKERS
    )

    if has_reasoning:
        # Find the last contiguous block of actual prose sentences (no reasoning markers).
        # Walk backwards from the end, collect lines that look like real sentences.
        prose_lines = []
        for line in reversed(lines):
            stripped = line.strip()
            if not stripped:
                if prose_lines:
                    break  # stop at blank line separating blocks
                continue
            # Stop if we hit a reasoning marker line
            if any(re.search(p, stripped, re.IGNORECASE) for p in REASONING_MARKERS):
                break
            # Stop if it looks like a planning note (ends with colon, is a numbered list item)
            if re.match(r"^\d+\.\s", stripped) or stripped.endswith(":"):
                break
            prose_lines.append(stripped)

        if prose_lines:
            text = " ".join(reversed(prose_lines))
        else:
            # Fallback: just take the last 3 sentences from the whole text
            sentences = re.split(r'(?<=[.!?])\s+', text.strip())
            sentences = [s for s in sentences if len(s) > 30]
            text = " ".join(sentences[-5:]) if sentences else text

    # Remove common preamble patterns
    text = _PREAMBLE_RE.sub("", text.strip())
    # Remove leading dash, asterisk, or quote artifacts
    text = re.sub(r'^[\-\*"\s]+', "", text)
    return text.strip()

# ── Fireworks API ─────────────────────────────────────────────────────────────

def call_fireworks(
    messages: list[dict],
    *,
    model: str,
    max_tokens: int = 512,
    temperature: float = 0.7,
    timeout: int | None = None,
    attempt: int = 0,
) -> str:
    """Call Fireworks chat completions with exponential backoff + jitter retry."""
    req_timeout = timeout if timeout is not None else API_TIMEOUT
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    try:
        resp = SESSION.post(
            f"{BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=req_timeout,
        )
        if resp.status_code == 429 or resp.status_code >= 500:
            raise requests.HTTPError(response=resp)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"] or ""
        content = re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.IGNORECASE).strip()
        return content
    except (requests.HTTPError, requests.Timeout, requests.ConnectionError, KeyError) as exc:
        if attempt < MAX_RETRIES - 1:
            # Exponential backoff with jitter — prevents thundering herd on 429
            wait = RETRY_BACKOFF * (2 ** attempt) + random.uniform(0, 1.0)
            log.warning("[%s] API retry %d/%d in %.1fs: %s",
                        model.split("/")[-1], attempt + 1, MAX_RETRIES, wait, exc)
            time.sleep(wait)
            return call_fireworks(
                messages, model=model, max_tokens=max_tokens,
                temperature=temperature, timeout=timeout, attempt=attempt + 1,
            )
        raise RuntimeError(f"Fireworks API [{model.split('/')[-1]}] failed after {MAX_RETRIES} attempts: {exc}") from exc

# ── Video download ────────────────────────────────────────────────────────────

def download_video(url: str, dest: Path) -> None:
    """Stream-download a video enforcing a 500 MB size cap."""
    log.info("Downloading: %s", url)

    # Try HEAD to check Content-Length early — ignore failures (some CDNs reject HEAD)
    try:
        head = SESSION.head(url, timeout=15, allow_redirects=True)
        content_length = int(head.headers.get("Content-Length", 0))
        if content_length > MAX_VIDEO_BYTES:
            raise RuntimeError(f"Content-Length {content_length // (1024*1024)}MB exceeds 500MB cap")
    except RuntimeError:
        raise
    except Exception as exc:
        log.warning("HEAD request failed (%s) — proceeding with streaming download", exc)

    resp = SESSION.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()

    written = 0
    try:
        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=4 * 1024 * 1024):
                if not chunk:
                    continue
                written += len(chunk)
                if written > MAX_VIDEO_BYTES:
                    raise RuntimeError("Video exceeds 500MB cap — aborting download")
                fh.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise

    if written == 0:
        dest.unlink(missing_ok=True)
        raise RuntimeError("Downloaded file is empty")

    log.info("Downloaded %.1f MB → %s", written / (1024 * 1024), dest.name)

# ── Frame extraction ──────────────────────────────────────────────────────────

def get_video_duration(video_path: Path) -> float:
    """Return video duration in seconds via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        str(video_path),
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=30)
        return float(json.loads(out)["format"]["duration"])
    except Exception as exc:
        log.warning("ffprobe failed (%s) — defaulting duration to 60s", exc)
        return 60.0

def adaptive_frame_count(duration: float) -> int:
    if is_time_tight():
        return 6
    if duration <= 30:  return 12
    if duration <= 60:  return 16
    return 20

def extract_frames(video_path: Path, frames_dir: Path) -> list[Path]:
    """
    Extract evenly-spaced JPEG frames plus scene-change frames.
    Uses ffmpeg select filter to capture visual transitions the fixed interval misses.
    Accepts either a local file path or a URL (ffmpeg handles both natively).
    """
    frames_dir.mkdir(parents=True, exist_ok=True)
    duration = get_video_duration(video_path)
    n_frames = adaptive_frame_count(duration)
    log.info("Duration: %.1fs — target %d frames", duration, n_frames)

    fps_val = n_frames / max(duration, 1.0)
    output_pattern = str(frames_dir / "frame_%04d.jpg")

    # Primary pass: evenly-spaced frames
    cmd = [
        "ffmpeg", "-y", "-nostdin",
        "-i", str(video_path),
        "-vf", (
            f"fps={fps_val:.6f},"
            f"scale={FRAME_WIDTH}:-2:flags=lanczos"
        ),
        "-vframes", str(n_frames),
        "-q:v", "3",
        output_pattern,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            log.warning("ffmpeg exited %d: %s",
                        result.returncode, result.stderr.decode(errors="replace")[-300:])
    except subprocess.TimeoutExpired:
        log.warning("ffmpeg timed out during frame extraction")

    # Scene-change pass: grab frames at hard cuts (up to 4 extra)
    scene_pattern = str(frames_dir / "scene_%04d.jpg")
    scene_cmd = [
        "ffmpeg", "-y", "-nostdin",
        "-i", str(video_path),
        "-vf", (
            f"select='gt(scene\\,0.35)',"
            f"scale={FRAME_WIDTH}:-2:flags=lanczos"
        ),
        "-vframes", "4",
        "-vsync", "vfr",
        "-q:v", "3",
        scene_pattern,
    ]
    try:
        subprocess.run(scene_cmd, capture_output=True, timeout=60)
    except (subprocess.TimeoutExpired, Exception) as exc:
        log.warning("Scene-change extraction failed: %s — continuing with evenly-spaced only", exc)

    paths = sorted(frames_dir.glob("*.jpg"))
    paths = [p for p in paths if p.stat().st_size > 0]
    MAX_FRAMES = 20
    if len(paths) > MAX_FRAMES:
        step = len(paths) / MAX_FRAMES
        paths = [paths[round(i * step)] for i in range(MAX_FRAMES)]
    log.info("Extracted %d valid frames (incl. scene-change frames)", len(paths))
    return paths


def get_video_duration_from_url(url: str) -> float:
    """Get video duration directly from URL via ffprobe without downloading."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        url,
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=30)
        return float(json.loads(out)["format"]["duration"])
    except Exception as exc:
        log.warning("ffprobe URL probe failed (%s) — defaulting duration to 60s", exc)
        return 60.0


def extract_frames_from_url(url: str, frames_dir: Path) -> list[Path]:
    """
    Extract frames directly from a video URL using ffmpeg — no full download needed.
    ffmpeg streams only the bytes it needs to decode the requested frames.
    This is the primary path for all clips; local download is the fallback.
    """
    frames_dir.mkdir(parents=True, exist_ok=True)

    # Probe duration directly from URL
    duration = get_video_duration_from_url(url)
    n_frames = adaptive_frame_count(duration)
    log.info("Duration: %.1fs — target %d frames (streaming from URL)", duration, n_frames)

    fps_val = n_frames / max(duration, 1.0)
    output_pattern = str(frames_dir / "frame_%04d.jpg")

    # Primary pass: evenly-spaced frames streamed directly from URL
    cmd = [
        "ffmpeg", "-y", "-nostdin",
        "-i", url,
        "-vf", (
            f"fps={fps_val:.6f},"
            f"scale={FRAME_WIDTH}:-2:flags=lanczos"
        ),
        "-vframes", str(n_frames),
        "-q:v", "3",
        output_pattern,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=180)
        if result.returncode != 0:
            log.warning("ffmpeg URL stream exited %d: %s",
                        result.returncode, result.stderr.decode(errors="replace")[-300:])
    except subprocess.TimeoutExpired:
        log.warning("ffmpeg URL stream timed out")

    # Scene-change pass from URL
    scene_pattern = str(frames_dir / "scene_%04d.jpg")
    scene_cmd = [
        "ffmpeg", "-y", "-nostdin",
        "-i", url,
        "-vf", (
            f"select='gt(scene\\,0.35)',"
            f"scale={FRAME_WIDTH}:-2:flags=lanczos"
        ),
        "-vframes", "4",
        "-vsync", "vfr",
        "-q:v", "3",
        scene_pattern,
    ]
    try:
        subprocess.run(scene_cmd, capture_output=True, timeout=90)
    except (subprocess.TimeoutExpired, Exception) as exc:
        log.warning("Scene-change URL pass failed: %s", exc)

    paths = sorted(frames_dir.glob("*.jpg"))
    paths = [p for p in paths if p.stat().st_size > 0]
    MAX_FRAMES = 20
    if len(paths) > MAX_FRAMES:
        step = len(paths) / MAX_FRAMES
        paths = [paths[round(i * step)] for i in range(MAX_FRAMES)]
    log.info("Extracted %d valid frames from URL", len(paths))
    return paths

# ── Frame encoding ────────────────────────────────────────────────────────────

def encode_frames(frame_paths: list[Path]) -> list[dict]:
    """Encode JPEG frames as base64 image_url content parts for the API."""
    parts = []
    for fp in frame_paths:
        b64 = base64.b64encode(fp.read_bytes()).decode()
        parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
        })
    return parts


def analyze_frame_parts(frame_parts: list[dict]) -> dict:
    """Lightweight analysis of base64 JPEG frames.

    Returns: dict with keys: dominant_color(str), motion_level(str), scene_changes(int)
    """
    avg_colors = []
    gray_frames = []
    for part in frame_parts:
        try:
            data = part.get("image_url", {}).get("url", "")
            if data.startswith("data:image"):
                b64 = data.split(",", 1)[1]
            else:
                b64 = data
            img_bytes = base64.b64decode(b64)
            im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            small = im.resize((64, 64))
            pixels = list(small.getdata())
            r = statistics.mean([p[0] for p in pixels])
            g = statistics.mean([p[1] for p in pixels])
            b = statistics.mean([p[2] for p in pixels])
            avg_colors.append((r, g, b))
            gray = small.convert("L")
            gray_frames.append(list(gray.getdata()))
        except Exception:
            continue

    def rgb_to_basic(col):
        # Map average RGB to basic color names
        palette = {
            "red": (220, 20, 60),
            "orange": (255, 165, 0),
            "yellow": (255, 215, 0),
            "green": (34, 139, 34),
            "blue": (30, 144, 255),
            "purple": (128, 0, 128),
            "brown": (150, 75, 0),
            "gray": (128, 128, 128),
            "black": (30, 30, 30),
            "white": (240, 240, 240)
        }
        def dist(a, b):
            return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2
        best = None
        best_name = "mixed"
        for name, pc in palette.items():
            d = dist(col, pc)
            if best is None or d < best:
                best = d
                best_name = name
        return best_name

    if avg_colors:
        mean_col = (
            statistics.mean([c[0] for c in avg_colors]),
            statistics.mean([c[1] for c in avg_colors]),
            statistics.mean([c[2] for c in avg_colors])
        )
        dominant_color = rgb_to_basic(mean_col)
    else:
        dominant_color = "unknown"

    # motion estimate via frame-to-frame gray diffs
    diffs = []
    for i in range(1, len(gray_frames)):
        a = gray_frames[i-1]
        b = gray_frames[i]
        if len(a) != len(b):
            continue
        diffs.append(statistics.mean([abs(x-y) for x, y in zip(a, b)]))
    avg_diff = statistics.mean(diffs) if diffs else 0.0
    if avg_diff < 2.5:
        motion = "still"
    elif avg_diff < 12:
        motion = "moderate motion"
    else:
        motion = "high motion"

    scene_changes = sum(1 for d in diffs if d > 20)

    return {
        "dominant_color": dominant_color,
        "motion_level": motion,
        "scene_changes": int(scene_changes),
    }


def local_caption_from_description(description: str, style: str, analysis: dict | None) -> str:
    """Create a template-style caption from description/analysis when API isn't available."""
    color = analysis.get("dominant_color") if analysis else "neutral tones"
    motion = analysis.get("motion_level") if analysis else "some motion"
    scenes = analysis.get("scene_changes") if analysis else 0

    if style == "formal":
        lines = [
            f"A {color} scene unfolds with {motion} and {scenes} scene changes.",
            "Subjects move through the space with clear, observable actions.",
            "Lighting and environment suggest a natural, documentary tone.",
            "Events progress in a straightforward chronological sequence.",
            "The clip ends with the main action resolving or pausing, leaving a clear final state."
        ]
        return " ".join(lines)

    if style == "sarcastic":
        lines = [
            f"In this thrilling {color}-themed masterpiece, something moves.{''}",
            f"There's {motion}, which is exactly what you'd expect at 0:00.",
            "A surprising plot twist: people continue to do the things they do.",
            "The mood is consistent and mildly unimpressed.",
            "Clock out — the scene ends with unsurprising finality."
        ]
        return " ".join(lines)

    if style == "humorous_tech":
        lines = [
            f"Patch notes: fixed a {color} regression causing {motion} across {scenes} scenes.",
            "This deployment experiences minor race conditions between subjects.",
            "Log shows repeated retries until behavior stabilizes.",
            "Unit tests would probably pass if we cared more about timing.",
            "Roll forward; commit message: 'works on my machine.'"
        ]
        return " ".join(lines)

    # humorous_non_tech
    lines = [
        f"Imagine a {color} backdrop where people awkwardly navigate {motion}.",
        "It's like watching someone try to find parking on a busy day.",
        "Every small action feels slightly heroic and oddly relatable.",
        "The clip builds gentle, everyday tension and then relaxes.",
        "It ends with a satisfying little resolution — nothing explosive, just human." 
    ]
    return " ".join(lines)

# ── Two-pass captioning ───────────────────────────────────────────────────────

def describe_video(frame_parts: list[dict]) -> str:
    """
    First pass: detailed narrative description from frames.
    Uses vision model with very low temperature for factual accuracy.
    Uses VISION_TIMEOUT (90s) — longer than caption calls because the multimodal
    payload (up to 20 base64 JPEGs) takes more time to upload and process.
    """
    messages = [
        {"role": "system", "content": DESCRIBE_SYSTEM},
        {
            "role": "user",
            "content": [
                *frame_parts,
                {"type": "text", "text": build_describe_prompt()},
            ],
        },
    ]
    description = call_fireworks(
        messages, model=VISION_MODEL, max_tokens=3000, temperature=0.1, timeout=VISION_TIMEOUT,
    )
    # Strip thinking tags that vision models sometimes leak
    description = re.sub(r"<think>[\s\S]*?</think>", "", description, flags=re.IGNORECASE).strip()
    if not description:
        log.warning("Vision model returned empty description — using fallback context")
        description = "A video clip. Unable to extract detailed visual description."
    return description


def generate_caption(style: str, description: str, analysis: dict | None = None) -> str:
    """
    Second pass: styled caption from description only — no frames, text model.
    Per-style temperature for optimal accuracy/creativity balance.
    Retries up to 5 times, detecting placeholder/empty responses.
    """
    temp = STYLE_TEMPERATURES.get(style, 0.7)
    messages = [
        {"role": "system", "content": STYLE_SYSTEM_PROMPTS[style]},
        {"role": "user", "content": _caption_user_prompt(description, style)},
    ]

    _PLACEHOLDER_RE = re.compile(
        r"caption text only|output the caption|nothing else|your \d[^.]*sentence|summary here",
        re.IGNORECASE,
    )

    last_caption = ""
    for attempt in range(5):
        try:
            raw = call_fireworks(messages, model=TEXT_MODEL, max_tokens=600, temperature=temp)
            caption = clean_caption(raw)
            # Reject if empty, too short, or echoing prompt instructions
            if len(caption) >= 40 and not _PLACEHOLDER_RE.search(caption):
                return caption
            last_caption = caption
            log.warning("[%s] Attempt %d: caption invalid (%d chars) — retrying",
                        style, attempt + 1, len(caption))
        except Exception as exc:
            log.warning("[%s] Attempt %d failed: %s", style, attempt + 1, exc)
            # If the API fails repeatedly, use a local template-based fallback
            if attempt == 0 and isinstance(exc, RuntimeError):
                # immediate local fallback when API unreachable
                return local_caption_from_description(description, style, analysis)
        # Slight temperature nudge on retry to break out of bad patterns
        temp = min(temp + 0.05, 0.95)
        time.sleep(1.0 * (attempt + 1))

    # All attempts exhausted — return best we got, or a safe local fallback
    if len(last_caption) >= 20:
        return last_caption
    return local_caption_from_description(description, style, analysis)

# ── Process one task ──────────────────────────────────────────────────────────

def process_task(task: dict, tmpdir: Path) -> dict:
    raw_id    = task.get("task_id", "unknown")
    video_url = _validate_url(task.get("video_url", ""))
    styles    = _validate_styles(task.get("styles", STYLES))
    task_id   = _sanitize_task_id(raw_id)

    log.info("[%s] Starting — styles: %s | budget remaining: %.0fs",
             task_id, styles, budget_remaining())

    # Try streaming frames directly from URL first (no full download needed).
    # Falls back to full download only if URL streaming fails.
    frames_dir = tmpdir / f"{task_id}_frames"
    frame_paths = []

    try:
        log.info("[%s] Streaming frames from URL", task_id)
        frame_paths = extract_frames_from_url(video_url, frames_dir)
    except Exception as exc:
        log.warning("[%s] URL streaming failed (%s) — falling back to full download", task_id, exc)

    if not frame_paths:
        # Fallback: download full file then extract
        log.info("[%s] Falling back to full download", task_id)
        video_path = tmpdir / f"{task_id}.mp4"
        download_video(video_url, video_path)
        frame_paths = extract_frames(video_path, frames_dir)
        video_path.unlink(missing_ok=True)

    if not frame_paths:
        raise RuntimeError("No frames could be extracted from the video")

    # Encode frames to base64
    frame_parts = encode_frames(frame_paths)

    # Analyze frames for a lightweight local fallback (dominant color, motion)
    analysis = analyze_frame_parts(frame_parts)

    # Clean up JPEG files — only base64 payloads needed now
    shutil.rmtree(frames_dir, ignore_errors=True)

    # Vision description pass — protect against vision/API failures and
    # continue with a safe fallback description so caption generation
    # can still produce sensible defaults instead of causing a full task
    # failure which would lead to error placeholders in results.json.
    log.info("[%s] Describing — %d frames, model: %s",
             task_id, len(frame_parts), VISION_MODEL.split("/")[-1])
    try:
        description = describe_video(frame_parts)
        log.info("[%s] Description preview: %.120s...", task_id, description)
    except Exception as exc:
        log.warning("[%s] Vision description failed (%s) — using fallback description", task_id, exc)
        description = "A short generic description: a video clip with unknown details."

    del frame_parts  # free memory

    # Caption pass — all requested styles in parallel
    log.info("[%s] Generating %d captions | budget remaining: %.0fs",
             task_id, len(styles), budget_remaining())
    captions: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=min(4, len(styles))) as executor:
        future_to_style = {
            executor.submit(generate_caption, style, description, analysis): style
            for style in styles
        }
        for future in as_completed(future_to_style):
            style = future_to_style[future]
            try:
                captions[style] = future.result(timeout=CAPTION_TIMEOUT)
                log.info("[%s] ✓ %s (temp=%.2f)", task_id, style, STYLE_TEMPERATURES.get(style, 0.7))
            except FuturesTimeoutError:
                captions[style] = f"Caption generation timed out after {CAPTION_TIMEOUT}s."
                log.error("[%s] ✗ %s: timed out", task_id, style)
            except Exception as exc:
                captions[style] = f"Caption generation failed: {exc}"
                log.error("[%s] ✗ %s: %s", task_id, style, exc)

    # Safety net — ensure every style has an entry
    for style in styles:
        if style not in captions:
            captions[style] = "Caption could not be generated."
            log.error("[%s] ✗ %s: missing from output (should never happen)", task_id, style)

    return {"task_id": raw_id, "captions": captions}

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    global INPUT_PATH, OUTPUT_PATH
    INPUT_PATH, OUTPUT_PATH = resolve_paths()

    log.info("=== XO-Screens Video Captioning Agent (Track 2) ===")
    log.info("Budget: %ds | Vision: %s | Text: %s",
             TOTAL_BUDGET_SECS,
             VISION_MODEL.split("/")[-1],
             TEXT_MODEL.split("/")[-1])

    startup_checks()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not INPUT_PATH.exists():
        log.error("Input file not found: %s", INPUT_PATH)
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        return 0

    try:
        tasks = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log.error("Failed to read input: %s", exc)
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        return 0

    if not isinstance(tasks, list):
        log.error("tasks.json must be a JSON array, got %s", type(tasks).__name__)
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        return 0

    if len(tasks) == 0:
        log.warning("tasks.json is empty — writing empty results")
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        return 0

    log.info("Tasks to process: %d", len(tasks))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Pre-seed results with placeholder captions for every task.
    # This guarantees OUTPUT_MISSING and MISSING_TASKS can never happen —
    # even if we crash mid-run, the output file will have an entry for every task.
    results: list[dict] = []
    for task in tasks:
        raw_id = task.get("task_id", "unknown")
        requested_styles = _validate_styles(task.get("styles", STYLES))
        results.append({
            "task_id": raw_id,
            "captions": {s: "Processing not completed." for s in requested_styles},
        })

    def _flush_results() -> None:
        """Write current results to disk. Called after each task and on exit."""
        try:
            OUTPUT_PATH.write_text(
                json.dumps(results, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError as exc:
            log.error("Failed to write output file: %s", exc)

    # Write placeholder file immediately — so OUTPUT_MISSING is impossible
    # even if we hit TIMEOUT before processing any task.
    _flush_results()

    tmpdir_obj = tempfile.TemporaryDirectory()

    try:
        tmp = Path(tmpdir_obj.name)
        for i, task in enumerate(tasks):
            raw_id = task.get("task_id", f"task_{i+1}")
            log.info("--- Task %d/%d: %s | elapsed: %.0fs ---",
                     i + 1, len(tasks), raw_id, elapsed())

            # Global budget guard
            if budget_remaining() < 60:
                log.error("Budget exhausted with %d task(s) remaining", len(tasks) - i)
                requested_styles = _validate_styles(task.get("styles", STYLES))
                results[i] = {
                    "task_id": raw_id,
                    "captions": {s: "Caption not generated: global time budget exhausted." for s in requested_styles},
                }
                # Fill remaining tasks too
                for j, remaining_task in enumerate(tasks[i+1:], i+1):
                    remaining_id     = remaining_task.get("task_id", "unknown")
                    remaining_styles = _validate_styles(remaining_task.get("styles", STYLES))
                    results[j] = {
                        "task_id": remaining_id,
                        "captions": {s: "Caption not generated: global time budget exhausted." for s in remaining_styles},
                    }
                break

            try:
                result = process_task(task, tmp)
                results[i] = result
                log.info("[%s] ✓ Complete | elapsed: %.0fs", raw_id, elapsed())
            except Exception as exc:
                log.error("[%s] ✗ Failed: %s", raw_id, exc, exc_info=True)
                requested_styles = _validate_styles(task.get("styles", STYLES))
                results[i] = {
                    "task_id": raw_id,
                    "captions": {
                        style: f"An error occurred while processing this video: {type(exc).__name__}"
                        for style in requested_styles
                    },
                }

            # Flush after every task — partial results survive TIMEOUT kills
            _flush_results()

    except Exception as exc:
        # Catch-all: any unhandled exception still writes output before exiting
        log.error("Unexpected top-level error: %s", exc, exc_info=True)
    finally:
        try:
            tmpdir_obj.cleanup()
        except Exception:
            pass

    # Final flush — ensures the last task's result is written
    _flush_results()

    log.info("=== Done: %d result(s) written | total elapsed: %.0fs ===",
             len(results), elapsed())
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
Track 2 — Video Captioning Agent
XO-Screens | AMD Developer Hackathon: ACT II

Pipeline:
  1. Read /input/tasks.json
  2. For each video: download → extract frames (single ffmpeg pass) → base64 encode
  3. First pass  — describe video from frames (vision model)
  4. Second pass — generate captions in all requested styles (parallel, text-only)
  5. Write /output/results.json
  6. Exit 0

Environment variables (Track 2 — use your own credentials):
  FIREWORKS_API_KEY   — your Fireworks AI API key
  FIREWORKS_BASE_URL  — optional override (default: https://api.fireworks.ai/inference/v1)
  VISION_MODEL        — optional override for the vision model
  TEXT_MODEL          — optional override for the text model
"""

import os
import re
import sys
import json
import base64
import hashlib
import shutil
import tempfile
import subprocess
import time
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("track2")

# ── Config ────────────────────────────────────────────────────────────────────

API_KEY  = os.environ.get("FIREWORKS_API_KEY", "").strip()
BASE_URL = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1").rstrip("/")

INPUT_PATH  = Path("/input/tasks.json")
OUTPUT_PATH = Path("/output/results.json")

MAX_FRAMES       = 16     # 16 evenly-spaced frames — better temporal coverage
FRAME_WIDTH      = 768    # px — preserves detail on high-res source videos
MAX_RETRIES      = 3
RETRY_BACKOFF    = 2.0    # seconds — exponential: 2s, 4s, 8s
DOWNLOAD_TIMEOUT = 180    # seconds per video download
API_TIMEOUT      = 90     # seconds per Fireworks API call
CAPTION_TIMEOUT  = 120    # seconds per individual caption call (per style)
MAX_VIDEO_BYTES  = 500 * 1024 * 1024  # 500 MB — videos are 30s–2min, 2GB would OOM

STYLES = ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]

# ── Model selection ───────────────────────────────────────────────────────────
#
# Track 2 has no ALLOWED_MODELS restriction — use any model you want.
# Override via environment variables for flexibility.

# Default models — vision-capable for description pass, efficient for caption pass
_DEFAULT_VISION_MODEL = "accounts/fireworks/models/qwen2p5-vl-72b-instruct"
_DEFAULT_TEXT_MODEL   = "accounts/fireworks/models/llama4-scout-instruct-basic"

VISION_MODEL = os.environ.get("VISION_MODEL", _DEFAULT_VISION_MODEL).strip()
TEXT_MODEL   = os.environ.get("TEXT_MODEL", _DEFAULT_TEXT_MODEL).strip()

# ── Startup checks ────────────────────────────────────────────────────────────

def startup_checks() -> None:
    """Validate environment and toolchain before processing any tasks."""
    errors = []

    if not API_KEY:
        errors.append("FIREWORKS_API_KEY is not set — set it in your environment or .env file")

    # Verify ffmpeg is available and executable
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=10,
        )
        if result.returncode != 0:
            errors.append("ffmpeg is installed but returned a non-zero exit code")
    except FileNotFoundError:
        errors.append("ffmpeg not found — ensure it is installed and on PATH")
    except subprocess.TimeoutExpired:
        errors.append("ffmpeg -version timed out")

    # Verify ffprobe is available
    try:
        result = subprocess.run(
            ["ffprobe", "-version"],
            capture_output=True,
            timeout=10,
        )
        if result.returncode != 0:
            errors.append("ffprobe is installed but returned a non-zero exit code")
    except FileNotFoundError:
        errors.append("ffprobe not found — ensure ffmpeg (with ffprobe) is installed")
    except subprocess.TimeoutExpired:
        errors.append("ffprobe -version timed out")

    if errors:
        for e in errors:
            log.error("Startup check failed: %s", e)
        sys.exit(1)

    log.info("Startup checks passed — ffmpeg and ffprobe available")
    log.info("VISION_MODEL : %s", VISION_MODEL)
    log.info("TEXT_MODEL   : %s", TEXT_MODEL)
    log.info("BASE_URL     : %s", BASE_URL)

# ── HTTP session (connection pooling + retry) ─────────────────────────────────

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
    """Return a filesystem-safe task ID, rejecting path traversal attempts."""
    if not isinstance(task_id, str) or not _SAFE_ID_RE.match(task_id):
        return "task_" + hashlib.sha1(str(task_id).encode()).hexdigest()[:12]
    return task_id

def _validate_url(url: str) -> str:
    """Raise ValueError if URL is not a safe http/https URL."""
    if not isinstance(url, str):
        raise ValueError(f"video_url must be a string, got {type(url)}")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsafe URL scheme '{parsed.scheme}' — only http/https allowed")
    if not parsed.netloc:
        raise ValueError("URL has no host")
    return url

def _validate_styles(requested: list) -> list[str]:
    """
    Return only the styles that are both requested and known.
    Preserve the original order from the request.
    Unknown style strings are logged and dropped — never silently replaced
    with all defaults (that would generate unrequested captions).
    """
    known = set(STYLES)
    valid = [s for s in requested if isinstance(s, str) and s in known]
    dropped = [s for s in requested if s not in known]
    if dropped:
        log.warning("Ignoring unknown styles: %s", dropped)
    if not valid:
        log.warning("No valid styles in request — falling back to all 4 defaults")
        return list(STYLES)
    return valid

# ── Style prompts ─────────────────────────────────────────────────────────────

STYLE_SYSTEM_PROMPTS = {
    "formal": (
        "You are a professional video captioning assistant. "
        "Write in a clear, neutral, formal register suitable for corporate or academic use. "
        "Be precise, objective, and factual. /no_think"
    ),
    "sarcastic": (
        "You are a witty, sarcastic video captioning assistant. "
        "Drip every caption with dry sarcasm and sardonic commentary — "
        "but still accurately describe what is actually happening in the video. /no_think"
    ),
    "humorous_tech": (
        "You are a tech-savvy comedian captioning videos for a developer audience. "
        "Sprinkle in programming jokes, tech buzzwords used ironically, and geek humour — "
        "but remain accurate about the video content. /no_think"
    ),
    "humorous_non_tech": (
        "You are a stand-up comedian captioning videos for a general audience. "
        "Keep the humour accessible, punny, and light-hearted — no technical jargon. "
        "Make it feel like a funny narrator at a roast. /no_think"
    ),
}

DESCRIBE_SYSTEM = "You are a precise video analysis assistant. Describe what you see thoroughly and accurately."

DESCRIBE_PROMPT = (
    "You are given frames sampled evenly from a video clip (30 seconds to 2 minutes long).\n\n"
    "Describe the video in detail:\n"
    "- What is the setting/location?\n"
    "- Who or what is in the video?\n"
    "- What actions or events are happening from start to finish?\n"
    "- Is there any text visible on screen?\n"
    "- What is the overall mood or tone?\n\n"
    "Be thorough and specific. This description will be used to generate captions. /no_think"
)

def _caption_user_prompt(description: str) -> str:
    return (
        f"Video description:\n{description}\n\n"
        "Write a single cohesive caption (2–4 sentences) for this video in your assigned style.\n"
        "The caption must:\n"
        "- Accurately reflect what is happening in the video\n"
        "- Be written entirely in your assigned tone\n"
        "- Be engaging and complete — not cut off mid-thought\n\n"
        "Return ONLY the caption text. No preamble, no labels, no JSON, no thinking. /no_think"
    )

# ── Fireworks API ─────────────────────────────────────────────────────────────

def call_fireworks(
    messages: list[dict],
    *,
    model: str,
    max_tokens: int = 512,
    temperature: float = 0.7,
    attempt: int = 0,
) -> str:
    """Call Fireworks chat completions with exponential backoff retry."""
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
            timeout=API_TIMEOUT,
        )
        if resp.status_code == 429 or resp.status_code >= 500:
            raise requests.HTTPError(response=resp)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"] or ""
        # Strip any leaked <think>...</think> blocks from reasoning models
        content = re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.IGNORECASE).strip()
        return content
    except (requests.HTTPError, requests.Timeout, requests.ConnectionError, KeyError) as exc:
        if attempt < MAX_RETRIES - 1:
            wait = RETRY_BACKOFF * (2 ** attempt)
            log.warning("API call failed (attempt %d/%d): %s — retrying in %.1fs",
                        attempt + 1, MAX_RETRIES, exc, wait)
            time.sleep(wait)
            return call_fireworks(
                messages, model=model, max_tokens=max_tokens,
                temperature=temperature, attempt=attempt + 1,
            )
        raise RuntimeError(f"Fireworks API failed after {MAX_RETRIES} attempts: {exc}") from exc

# ── Video download ────────────────────────────────────────────────────────────

def download_video(url: str, dest: Path) -> None:
    """
    Stream-download a video to dest, enforcing a 500 MB size cap.
    Raises RuntimeError on size violation or incomplete download.
    """
    log.info("Downloading: %s", url)
    resp = SESSION.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()

    written = 0
    try:
        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=4 * 1024 * 1024):  # 4 MB chunks
                if not chunk:
                    continue
                written += len(chunk)
                if written > MAX_VIDEO_BYTES:
                    raise RuntimeError(
                        f"Video exceeds {MAX_VIDEO_BYTES // (1024 * 1024)} MB size cap — aborting"
                    )
                fh.write(chunk)
    except Exception:
        # Clean up partial file on any failure
        dest.unlink(missing_ok=True)
        raise

    if written == 0:
        dest.unlink(missing_ok=True)
        raise RuntimeError("Downloaded file is empty — connection may have dropped")

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


def extract_frames(video_path: Path, frames_dir: Path, n_frames: int = MAX_FRAMES) -> list[Path]:
    """
    Extract n_frames evenly-spaced JPEG frames using a single ffmpeg invocation.
    Frames are written to frames_dir. Caller is responsible for cleaning up frames_dir.
    """
    frames_dir.mkdir(parents=True, exist_ok=True)
    duration = get_video_duration(video_path)
    log.info("Duration: %.1fs — extracting %d frames", duration, n_frames)

    fps_val = n_frames / max(duration, 1.0)  # guard against zero-duration edge case
    output_pattern = str(frames_dir / "frame_%03d.jpg")

    cmd = [
        "ffmpeg", "-y", "-nostdin",
        "-i", str(video_path),
        "-vf", f"fps={fps_val:.6f},scale={FRAME_WIDTH}:-2",
        "-vframes", str(n_frames),
        "-q:v", "4",
        output_pattern,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            log.warning(
                "ffmpeg exited %d: %s",
                result.returncode,
                result.stderr.decode(errors="replace")[-400:],
            )
    except subprocess.TimeoutExpired:
        log.warning("ffmpeg timed out during frame extraction")

    paths = sorted(frames_dir.glob("frame_*.jpg"))
    paths = [p for p in paths if p.stat().st_size > 0]  # drop zero-byte corrupt frames
    log.info("Extracted %d valid frames", len(paths))
    return paths

# ── Frame encoding ────────────────────────────────────────────────────────────

def encode_frames(frame_paths: list[Path]) -> list[dict]:
    """Encode JPEG frames as base64 image_url content parts."""
    parts = []
    for fp in frame_paths:
        b64 = base64.b64encode(fp.read_bytes()).decode()
        parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
        })
    return parts

# ── Two-pass captioning ───────────────────────────────────────────────────────

def describe_video(frame_parts: list[dict]) -> str:
    """First pass: detailed video description from frames (vision model)."""
    messages = [
        {"role": "system", "content": DESCRIBE_SYSTEM},
        {
            "role": "user",
            "content": [
                *frame_parts,
                {"type": "text", "text": DESCRIBE_PROMPT},
            ],
        },
    ]
    return call_fireworks(messages, model=VISION_MODEL, max_tokens=1200, temperature=0.2)


def generate_caption(style: str, description: str) -> str:
    """Second pass: styled caption from description only — no frames, cheap text model."""
    messages = [
        {"role": "system", "content": STYLE_SYSTEM_PROMPTS[style]},
        {"role": "user", "content": _caption_user_prompt(description)},
    ]
    return call_fireworks(messages, model=TEXT_MODEL, max_tokens=300, temperature=0.8)

# ── Process one task ──────────────────────────────────────────────────────────

def process_task(task: dict, tmpdir: Path) -> dict:
    raw_id    = task.get("task_id", "unknown")
    video_url = _validate_url(task.get("video_url", ""))
    styles    = _validate_styles(task.get("styles", STYLES))
    task_id   = _sanitize_task_id(raw_id)

    log.info("[%s] Starting — styles: %s — url: %s", task_id, styles, video_url)

    # 1. Download
    video_path = tmpdir / f"{task_id}.mp4"
    download_video(video_url, video_path)

    # 2. Extract frames into a per-task subdirectory
    frames_dir  = tmpdir / f"{task_id}_frames"
    frame_paths = extract_frames(video_path, frames_dir)

    if not frame_paths:
        raise RuntimeError("No frames could be extracted from the video")

    # 3. Encode frames to base64
    frame_parts = encode_frames(frame_paths)

    # 4. Clean up JPEG files from disk immediately — we only need the base64 now
    try:
        shutil.rmtree(frames_dir, ignore_errors=True)
    except Exception as exc:
        log.warning("[%s] Could not clean up frames dir: %s", task_id, exc)

    # 5. Describe (vision pass — frames sent exactly once)
    log.info("[%s] Describing video (%d frames)...", task_id, len(frame_parts))
    description = describe_video(frame_parts)
    log.info("[%s] Description (first 120 chars): %s...", task_id, description[:120])

    # Free base64 data from memory — not needed after description
    del frame_parts

    # 6. Clean up video file to free disk space for subsequent tasks
    try:
        video_path.unlink(missing_ok=True)
    except Exception as exc:
        log.warning("[%s] Could not delete video file: %s", task_id, exc)

    # 7. Caption pass — all requested styles in parallel, text-only
    log.info("[%s] Generating captions for styles: %s", task_id, styles)
    captions: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=min(4, len(styles))) as executor:
        future_to_style = {
            executor.submit(generate_caption, style, description): style
            for style in styles
        }

        for future in as_completed(future_to_style, timeout=None):
            # timeout=None: we handle per-call timeouts inside call_fireworks via
            # requests timeout — don't let FuturesTimeoutError silently drop styles
            style = future_to_style[future]
            try:
                captions[style] = future.result(timeout=CAPTION_TIMEOUT)
                log.info("[%s] ✓ %s", task_id, style)
            except FuturesTimeoutError:
                captions[style] = f"[Caption timed out after {CAPTION_TIMEOUT}s]"
                log.error("[%s] ✗ %s: timed out", task_id, style)
            except Exception as exc:
                captions[style] = f"[Caption generation failed: {exc}]"
                log.error("[%s] ✗ %s: %s", task_id, style, exc)

    # Ensure every requested style has an entry — guard against any edge case
    for style in styles:
        if style not in captions:
            captions[style] = "[Caption not generated — unknown error]"
            log.error("[%s] ✗ %s: missing from captions dict (should never happen)", task_id, style)

    return {"task_id": raw_id, "captions": captions}

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("=== XO-Screens Video Captioning Agent (Track 2) ===")

    # Run startup checks before touching any task data
    startup_checks()

    if not INPUT_PATH.exists():
        log.error("Input file not found: %s", INPUT_PATH)
        sys.exit(1)

    try:
        tasks = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log.error("Failed to read input: %s", exc)
        sys.exit(1)

    if not isinstance(tasks, list):
        log.error("tasks.json must be a JSON array, got %s", type(tasks).__name__)
        sys.exit(1)

    if len(tasks) == 0:
        log.warning("tasks.json is an empty array — writing empty results")
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        sys.exit(0)

    log.info("Tasks to process: %d", len(tasks))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        for i, task in enumerate(tasks, 1):
            raw_id = task.get("task_id", f"task_{i}")
            log.info("--- Task %d/%d: %s ---", i, len(tasks), raw_id)
            try:
                result = process_task(task, tmp)
                results.append(result)
                log.info("[%s] ✓ Complete", raw_id)
            except Exception as exc:
                log.error("[%s] ✗ Failed: %s", raw_id, exc, exc_info=True)
                # Write error placeholders for every requested style so the
                # output always has the expected structure — missing styles score zero
                requested_styles = _validate_styles(task.get("styles", STYLES))
                results.append({
                    "task_id": raw_id,
                    "captions": {
                        style: f"[Error processing task: {exc}]"
                        for style in requested_styles
                    },
                })

    OUTPUT_PATH.write_text(
        json.dumps(results, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info("=== Done. %d result(s) written to %s ===", len(results), OUTPUT_PATH)
    sys.exit(0)


if __name__ == "__main__":
    main()

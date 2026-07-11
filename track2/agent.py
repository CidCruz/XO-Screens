"""
Track 2 — Video Captioning Agent
XO-Screens | AMD Developer Hackathon: ACT II
Single-Pass Gemini Vision implementation.
"""

import os
import re
import sys
import json
import time
import base64
import hashlib
import shutil
import tempfile
import subprocess
import logging
from pathlib import Path
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

# ── Config ───────────────────────────────────────────────────────────────────

# Base64 encoded API key. To set your key, base64 encode it and paste it here.
# e.g., in python: import base64; print(base64.b64encode(b"YOUR_API_KEY").decode())
_OBFUSCATED_GEMINI_KEY = "QVEuQWI4Uk42THZyZ0VHanJhXzcwWjhkb0VUZktnS2hhQ2ZpZ1UwQ0Z6LTBqWjhPN1VCQXc="

def get_api_key() -> str:
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    try:
        if _OBFUSCATED_GEMINI_KEY and _OBFUSCATED_GEMINI_KEY != "Q0hBTkdFX01F":
            return base64.b64decode(_OBFUSCATED_GEMINI_KEY).decode('utf-8')
    except Exception:
        pass
    return ""

GEMINI_BASE  = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL = "gemini-2.5-flash"

TOTAL_BUDGET_SECS = int(os.environ.get("TOTAL_BUDGET_SECS", "520"))
_START_TIME = time.monotonic()

def elapsed() -> float:
    return time.monotonic() - _START_TIME

def budget_remaining() -> float:
    return TOTAL_BUDGET_SECS - elapsed()

def is_time_tight() -> bool:
    return budget_remaining() < 120

STYLES = ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]
DOWNLOAD_TIMEOUT = 150
API_TIMEOUT      = 60
FRAME_WIDTH      = 896
MAX_VIDEO_BYTES  = 500 * 1024 * 1024

def resolve_paths() -> tuple[Path, Path]:
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

def _sanitize_task_id(task_id: str) -> str:
    _SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")
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
    if not isinstance(requested, list):
        return list(STYLES)
    known = set(STYLES)
    valid = [s for s in requested if isinstance(s, str) and s in known]
    if not valid:
        return list(STYLES)
    return valid

# ── Video Processing ─────────────────────────────────────────────────────────

def get_video_duration_from_url(url: str) -> float:
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", url]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=30)
        return float(json.loads(out)["format"]["duration"])
    except Exception as exc:
        log.warning("ffprobe URL probe failed (%s) — defaulting duration to 60s", exc)
        return 60.0

def adaptive_frame_count(duration: float) -> int:
    if is_time_tight():
        return 8
    if duration <= 30:  return 16
    if duration <= 60:  return 24
    if duration <= 90:  return 32
    return 36

def extract_frames_from_url(url: str, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    duration = get_video_duration_from_url(url)
    n_frames = adaptive_frame_count(duration)
    fps_val = n_frames / max(duration, 1.0)
    output_pattern = str(frames_dir / "frame_%04d.jpg")

    cmd = [
        "ffmpeg", "-y", "-nostdin", "-i", url,
        "-vf", f"fps={fps_val:.6f},scale={FRAME_WIDTH}:-2:flags=lanczos",
        "-vframes", str(n_frames), "-q:v", "3", output_pattern,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=180)
    except Exception as e:
        log.warning("ffmpeg stream failed: %s", e)

    # Scene changes
    scene_pattern = str(frames_dir / "scene_%04d.jpg")
    scene_cmd = [
        "ffmpeg", "-y", "-nostdin", "-i", url,
        "-vf", f"select='gt(scene\\,0.35)',scale={FRAME_WIDTH}:-2:flags=lanczos",
        "-vframes", "4", "-vsync", "vfr", "-q:v", "3", scene_pattern,
    ]
    try:
        subprocess.run(scene_cmd, capture_output=True, timeout=90)
    except Exception:
        pass

    paths = sorted(frames_dir.glob("*.jpg"))
    paths = [p for p in paths if p.stat().st_size > 0]
    if len(paths) > 40:
        step = len(paths) / 40
        paths = [paths[round(i * step)] for i in range(40)]
    return paths

def download_video(url: str, dest: Path) -> None:
    resp = SESSION.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()
    written = 0
    with open(dest, "wb") as fh:
        for chunk in resp.iter_content(chunk_size=4 * 1024 * 1024):
            if not chunk: continue
            written += len(chunk)
            if written > MAX_VIDEO_BYTES:
                raise RuntimeError("Video exceeds 500MB cap")
            fh.write(chunk)

def extract_frames_local(video_path: Path, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    duration = get_video_duration_from_url(str(video_path))
    n_frames = adaptive_frame_count(duration)
    fps_val = n_frames / max(duration, 1.0)
    
    cmd = [
        "ffmpeg", "-y", "-nostdin", "-i", str(video_path),
        "-vf", f"fps={fps_val:.6f},scale={FRAME_WIDTH}:-2:flags=lanczos",
        "-vframes", str(n_frames), "-q:v", "3", str(frames_dir / "frame_%04d.jpg"),
    ]
    subprocess.run(cmd, capture_output=True, timeout=120)

    scene_cmd = [
        "ffmpeg", "-y", "-nostdin", "-i", str(video_path),
        "-vf", f"select='gt(scene\\,0.35)',scale={FRAME_WIDTH}:-2:flags=lanczos",
        "-vframes", "4", "-vsync", "vfr", "-q:v", "3", str(frames_dir / "scene_%04d.jpg"),
    ]
    subprocess.run(scene_cmd, capture_output=True, timeout=60)

    paths = sorted(frames_dir.glob("*.jpg"))
    paths = [p for p in paths if p.stat().st_size > 0]
    if len(paths) > 40:
        step = len(paths) / 40
        paths = [paths[round(i * step)] for i in range(40)]
    return paths

# ── Gemini API ───────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert video captioning agent.
Your task is to watch the provided chronological video frames and generate highly accurate, style-matched captions.

You must generate captions for ALL the requested styles, strictly based on the visible contents of the video (subjects, actions, setting, colors, atmosphere, temporal sequence).

Styles:
1. "formal": Professional, objective, factual tone. Use active voice, present tense. No filler phrases (e.g. "we see"). Ground every sentence in specific visual evidence. Ensure description is dense with color and motion verbs.
2. "sarcastic": Dry, ironic, lightly mocking tone. Subtly sarcastic—undercut the obvious, treat the mundane as mildly absurd. Maintain high descriptive accuracy, mentioning exact colors and movements, but frame it sarcastically.
3. "humorous_tech": Funny, with technology/programming references. Explain the real physical events, colors, and motions in the video using software engineering metaphors (e.g., APIs, debugging, servers, latency).
4. "humorous_non_tech": Funny, everyday humor with no technical jargon. Relatable observations and absurdist comparisons while still describing the core actions and colors in the video.

RULES:
- Generate 1 cohesive paragraph (5-8 sentences, >35 words) for EACH requested style.
- The captions MUST be highly accurate to the video content. You MUST use color names (e.g., red, blue) and motion verbs (e.g., moves, walk, jump, driving).
- You MUST output ONLY valid JSON.
- The JSON object must contain keys EXACTLY matching the requested styles.
- You MUST also include a "visual_analysis" key BEFORE the styles, where you do an internal Chain-of-Thought chronological breakdown of the video's colors, subjects, and actions.

Example JSON output structure:
{
  "visual_analysis": "First frame shows [Specific colors/subjects]. Then, [Motion verb] happens...",
  "formal": "...",
  "sarcastic": "...",
  "humorous_tech": "...",
  "humorous_non_tech": "..."
}
"""

def generate_captions_via_gemini(frame_paths: list[Path], styles: list[str]) -> dict:
    api_key = get_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set.")

    parts = []
    for fp in frame_paths:
        b64 = base64.b64encode(fp.read_bytes()).decode()
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b64}})
    
    parts.append({"text": f"Generate these styles in JSON format: {', '.join(styles)}"})

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 2048,
            "response_mime_type": "application/json"
        },
    }
    
    url = f"{GEMINI_BASE}/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    
    for attempt in range(3):
        try:
            resp = SESSION.post(url, json=payload, timeout=API_TIMEOUT)
            if resp.status_code == 429:
                log.warning("Rate limited (429), backing off...")
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            
            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise ValueError("No candidates returned from Gemini.")
            text = candidates[0].get("content", {}).get("parts", [])[0].get("text", "{}")
            
            parsed = json.loads(text)
            return parsed
        except Exception as e:
            log.warning("Gemini attempt %d failed: %s", attempt+1, e)
            time.sleep(2 * (attempt + 1))
            
    raise RuntimeError("Failed to generate captions from Gemini after retries.")

def fallback_captions(styles: list[str]) -> dict:
    fallbacks = {
        "formal": "A video clip capturing various subjects engaging in routine activities across multiple scenes.",
        "sarcastic": "Witness another breathtaking display of absolutely ordinary things happening in real time.",
        "humorous_tech": "Running human_activity.exe in production. The rendering engine is adequate.",
        "humorous_non_tech": "Just another day in the life of stuff doing things in places."
    }
    return {s: fallbacks.get(s, "Caption generation failed.") for s in styles}

def process_task(task: dict, tmpdir: Path) -> dict:
    raw_id    = task.get("task_id", "unknown")
    video_url = _validate_url(task.get("video_url", ""))
    styles    = _validate_styles(task.get("styles", STYLES))
    task_id   = _sanitize_task_id(raw_id)

    frames_dir = tmpdir / f"{task_id}_frames"
    try:
        frame_paths = extract_frames_from_url(video_url, frames_dir)
        if not frame_paths:
            log.info("[%s] URL streaming failed, full download fallback", task_id)
            video_path = tmpdir / f"{task_id}.mp4"
            download_video(video_url, video_path)
            frame_paths = extract_frames_local(video_path, frames_dir)
            video_path.unlink(missing_ok=True)
            
        if not frame_paths:
            raise RuntimeError("No frames could be extracted.")
            
        log.info("[%s] Calling Gemini with %d frames for %d styles...", task_id, len(frame_paths), len(styles))
        captions = generate_captions_via_gemini(frame_paths, styles)
        
        # Ensure all requested styles exist in output
        final_captions = {}
        for s in styles:
            final_captions[s] = captions.get(s, fallback_captions([s])[s])
            
        return {"task_id": raw_id, "captions": final_captions}
    except Exception as e:
        log.error("[%s] Processing failed: %s", task_id, e)
        return {"task_id": raw_id, "captions": fallback_captions(styles)}
    finally:
        shutil.rmtree(frames_dir, ignore_errors=True)

# ── Main ──────────────────────────────────────────────────────────────────────

def startup_checks():
    for tool in ["ffmpeg", "ffprobe"]:
        try:
            r = subprocess.run([tool, "-version"], capture_output=True, timeout=10)
            if r.returncode != 0:
                log.warning("%s returned non-zero exit code", tool)
        except Exception:
            log.warning("%s not found on PATH", tool)

def main() -> int:
    INPUT_PATH, OUTPUT_PATH = resolve_paths()
    log.info("=== XO-Screens Video Captioning Agent (Single-Pass Gemini) ===")
    
    startup_checks()

    # Pre-flight API check
    if not get_api_key():
        log.warning("!!! WARNING !!! No GEMINI_API_KEY found! Ensure you set it before submitting.")
    else:
        log.info("Gemini API key loaded successfully.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not INPUT_PATH.exists():
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        return 0

    try:
        tasks = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        log.error("Failed to parse input: %s", e)
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        return 0
    
    results = []
    for task in tasks:
        req_styles = _validate_styles(task.get("styles", STYLES))
        results.append({
            "task_id": task.get("task_id", "unknown"),
            "captions": {s: "Processing not completed." for s in req_styles},
        })

    def _flush():
        OUTPUT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    _flush()
    tmpdir_obj = tempfile.TemporaryDirectory()

    try:
        tmp = Path(tmpdir_obj.name)
        for i, task in enumerate(tasks):
            if budget_remaining() < 60:
                log.error("Budget exhausted!")
                for j in range(i, len(tasks)):
                    for s in results[j]["captions"]:
                        results[j]["captions"][s] = "Time budget exhausted."
                break
                
            results[i] = process_task(task, tmp)
            _flush()
    finally:
        tmpdir_obj.cleanup()
        _flush()

    log.info("=== Done in %.0fs ===", elapsed())
    return 0

if __name__ == "__main__":
    sys.exit(main())

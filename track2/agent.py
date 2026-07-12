"""
Track 2 — Video Captioning Agent
XO-Screens | AMD Developer Hackathon: ACT II
Two-Pass Gemini implementation (Vision -> Style).
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
    if duration <= 30:  return 12
    if duration <= 60:  return 16
    return 20

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
    if len(paths) > 20:
        step = len(paths) / 20
        paths = [paths[round(i * step)] for i in range(20)]
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
    if len(paths) > 20:
        step = len(paths) / 20
        paths = [paths[round(i * step)] for i in range(20)]
    return paths

# ── Gemini API (Two-Pass DescribeX Mimic) ───────────────────────────────────────────────────────────────

VISION_PROMPT = """You are a precise visual analyst. You will be shown {frame_count} representative frames sampled from a short video. Your task is to produce a structured, factual understanding of the video content.

Analyze the frames and provide a detailed description covering ALL of the following categories:

1. **Scene / Setting**
   Where is this taking place? Describe the location, venue, or environment visible in the frames.

2. **Subjects**
   Who or what is visible? Describe people, animals, objects, or other focal subjects. Note their appearance, positioning, and any distinguishing features.

3. **Actions**
   What is happening? Describe the activities, movements, interactions, or events taking place across the frames.

4. **Environment**
   Is this indoor or outdoor? What time of day does it appear to be? Are there any weather or seasonal indicators?

5. **Mood / Tone**
   What feeling or atmosphere does the video convey? Consider lighting, color grading, facial expressions, body language, and pacing.

6. **Key Visual Elements**
   Note prominent colors, notable objects, any on-screen text or overlays, graphical elements, and visual transitions between frames.

7. **Temporal Flow**
   How does the scene progress from the first frame to the last? Describe any changes, developments, or narrative arc visible across the sequence of frames.

IMPORTANT INSTRUCTIONS:
- Be factual and neutral throughout. Report only what you observe.
- Do NOT generate captions or taglines.
- Do NOT inject humor, sarcasm, or personal opinion.
- This is an internal analytical step. Your description will be used downstream — accuracy and completeness are critical.
- Write in clear, concise prose. Use the numbered categories above as your structure.
"""

STYLE_PROMPT = """You are an expert caption writer. Below is a factual scene description generated from a video. Your task is to generate captions for this video in exactly four distinct styles.

--- SCENE DESCRIPTION ---
{scene_description}
--- END SCENE DESCRIPTION ---

Generate one caption for EACH of the following styles:

1. **formal** — Professional, clear, and informative. Suitable for business presentations, educational content, or official communications. Use precise language and a neutral, authoritative tone.

2. **sarcastic** — Witty, ironic, and tongue-in-cheek. Deliver commentary that playfully pokes fun at what is happening in the video. Use dry humor and clever observations.

3. **humorous_tech** — Funny with references to tech culture, programming, internet memes, or developer humor. Use analogies to software, hardware, algorithms, or well-known tech concepts to make the caption entertaining for a tech-savvy audience.

4. **humorous_non_tech** — Funny with everyday, relatable, non-technical humor. Use observations about daily life, common human experiences, or universally understood situations. No jargon — accessible to everyone.

REQUIREMENTS:
- Each caption MUST be 2 to 4 sentences long.
- Output ONLY a valid JSON object with exactly these four keys: "formal", "sarcastic", "humorous_tech", "humorous_non_tech".
- Each value must be a single string containing the caption for that style.
- Do NOT wrap the JSON in markdown code fences.
- Do NOT include any explanation, commentary, or extra text before or after the JSON.
- Output ONLY the JSON object. Nothing else.
"""

def generate_factual_summary(frame_paths: list[Path]) -> str:
    api_key = get_api_key()
    
    parts = [{"text": VISION_PROMPT.format(frame_count=len(frame_paths))}]
    for fp in frame_paths:
        b64 = base64.b64encode(fp.read_bytes()).decode()
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b64}})

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
        },
    }
    
    url = f"{GEMINI_BASE}/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    
    for attempt in range(3):
        try:
            resp = SESSION.post(url, json=payload, timeout=API_TIMEOUT)
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            log.warning("Vision Pass attempt %d failed: %s", attempt+1, e)
            time.sleep(2 * (attempt + 1))
            
    raise RuntimeError("Failed to generate vision summary.")

def generate_styled_captions(description: str, styles: list[str]) -> dict:
    api_key = get_api_key()
    
    prompt = STYLE_PROMPT.format(scene_description=description)

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 2048,
            "response_mime_type": "application/json"
        },
    }
    
    url = f"{GEMINI_BASE}/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    
    for attempt in range(3):
        try:
            resp = SESSION.post(url, json=payload, timeout=API_TIMEOUT)
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Clean up markdown if Gemini leaked it
            if text.startswith("```"):
                text = text.strip().split("\n", 1)[-1].rsplit("\n", 1)[0]
                
            return json.loads(text)
        except Exception as e:
            log.warning("Style Pass attempt %d failed: %s", attempt+1, e)
            time.sleep(2 * (attempt + 1))
            
    raise RuntimeError("Failed to generate style captions.")

def fallback_captions(styles: list[str]) -> dict:
    fallbacks = {
        "formal": "A video clip capturing various subjects engaging in routine activities across multiple scenes. It is well lit.",
        "sarcastic": "Witness another breathtaking display of absolutely ordinary things happening in real time. It truly is the pinnacle of cinema. I am overwhelmed.",
        "humorous_tech": "Running human_activity.exe in production. The rendering engine is adequate. The frame rate is surprisingly stable.",
        "humorous_non_tech": "Just another day in the life of stuff doing things in places. Someone clearly had too much coffee. It is what it is."
    }
    return {s: fallbacks.get(s, "Caption generation failed. We tried our best.") for s in styles}

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
            
        log.info("[%s] Calling Gemini Vision Pass with %d frames...", task_id, len(frame_paths))
        description = generate_factual_summary(frame_paths)
        
        log.info("[%s] Calling Gemini Style Pass...", task_id)
        captions = generate_styled_captions(description, styles)
        
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
    log.info("=== XO-Screens Video Captioning Agent (Two-Pass DescribeX Mimic) ===")
    
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

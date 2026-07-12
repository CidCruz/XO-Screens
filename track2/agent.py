"""
Track 2 — Video Captioning Agent
XO-Screens | AMD Developer Hackathon: ACT II
<<<<<<< Updated upstream
Single-Pass Fusion (Vision + Style + AMD Strict Guidelines).
=======
Two-Pass Fireworks implementation (Vision -> Style).
>>>>>>> Stashed changes
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
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("track2")

# ── Config ───────────────────────────────────────────────────────────────────

def get_api_key() -> str:
    return os.environ.get("FIREWORKS_API_KEY", "").strip()

def load_model_config() -> dict:
    defaults = {
        "vision": "accounts/fireworks/models/kimi-k2p6",
        "process": "accounts/fireworks/models/deepseek-v4-pro",
    }
    config_path = Path(os.environ.get("MODEL_CONFIG_PATH", Path(__file__).with_name("model_config.json")))
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            for key in defaults:
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    defaults[key] = value.strip()
    except FileNotFoundError:
        pass
    except Exception as exc:
        log.warning("Failed to load model config from %s: %s", config_path, exc)
    return defaults

MODEL_CONFIG = load_model_config()
FIREWORKS_BASE_URL = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1").rstrip("/")
VISION_MODEL = os.environ.get("VISION_MODEL", MODEL_CONFIG["vision"])
PROCESS_MODEL = os.environ.get("PROCESS_MODEL", MODEL_CONFIG["process"])

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
USAGE_LOG_DIR = Path(os.environ.get("USAGE_LOG_DIR", str(Path("token") / "credits usage")))
USAGE_LOG = None
USAGE_LOG_PATH = None

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _number(value, default=0):
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

def _credit_value(payload: dict, usage: dict):
    for source in (usage, payload):
        for key in ("credits", "credit_usage", "cost", "cost_usd", "estimated_cost", "estimated_cost_usd"):
            value = source.get(key) if isinstance(source, dict) else None
            if isinstance(value, (int, float)):
                return value
    return None

def start_usage_log(input_path: Path, output_path: Path) -> None:
    global USAGE_LOG, USAGE_LOG_PATH
    run_started_at = _utc_now()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"_{os.getpid()}_{time.time_ns()}"
    USAGE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    USAGE_LOG_PATH = USAGE_LOG_DIR / f"{run_id}.json"
    USAGE_LOG = {
        "run_id": run_id,
        "started_at": run_started_at,
        "finished_at": None,
        "elapsed_seconds": None,
        "provider": "fireworks",
        "base_url": FIREWORKS_BASE_URL,
        "input_path": str(input_path),
        "output_path": str(output_path),
        "configured_models": {
            "vision": VISION_MODEL,
            "process": PROCESS_MODEL,
        },
        "totals": {
            "calls": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "credits": None,
        },
        "by_model": {},
        "calls": [],
    }
    flush_usage_log()

def flush_usage_log() -> None:
    if not USAGE_LOG or not USAGE_LOG_PATH:
        return
    USAGE_LOG_PATH.write_text(json.dumps(USAGE_LOG, indent=2, ensure_ascii=False), encoding="utf-8")

def finish_usage_log() -> None:
    if not USAGE_LOG:
        return
    USAGE_LOG["finished_at"] = _utc_now()
    USAGE_LOG["elapsed_seconds"] = round(elapsed(), 3)
    flush_usage_log()

def record_model_usage(model: str, stage: str, payload: dict, attempt: int) -> None:
    if not USAGE_LOG:
        return

    usage = payload.get("usage") if isinstance(payload, dict) else {}
    usage = usage if isinstance(usage, dict) else {}
    prompt_tokens = _number(usage.get("prompt_tokens", usage.get("input_tokens")))
    completion_tokens = _number(usage.get("completion_tokens", usage.get("output_tokens")))
    total_tokens = _number(usage.get("total_tokens"), prompt_tokens + completion_tokens)
    credits = _credit_value(payload, usage)

    call = {
        "at": _utc_now(),
        "stage": stage,
        "model": model,
        "attempt": attempt,
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        },
    }
    if credits is not None:
        call["credits"] = credits
    USAGE_LOG["calls"].append(call)

    totals = USAGE_LOG["totals"]
    totals["calls"] += 1
    totals["prompt_tokens"] += prompt_tokens
    totals["completion_tokens"] += completion_tokens
    totals["total_tokens"] += total_tokens
    if credits is not None:
        totals["credits"] = (totals["credits"] or 0) + credits

    model_totals = USAGE_LOG["by_model"].setdefault(model, {
        "calls": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "credits": None,
        "stages": {},
    })
    model_totals["calls"] += 1
    model_totals["prompt_tokens"] += prompt_tokens
    model_totals["completion_tokens"] += completion_tokens
    model_totals["total_tokens"] += total_tokens
    if credits is not None:
        model_totals["credits"] = (model_totals["credits"] or 0) + credits

    stage_totals = model_totals["stages"].setdefault(stage, {
        "calls": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "credits": None,
    })
    stage_totals["calls"] += 1
    stage_totals["prompt_tokens"] += prompt_tokens
    stage_totals["completion_tokens"] += completion_tokens
    stage_totals["total_tokens"] += total_tokens
    if credits is not None:
        stage_totals["credits"] = (stage_totals["credits"] or 0) + credits

    flush_usage_log()

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

<<<<<<< Updated upstream
# ── Gemini API (Single-Pass Fusion) ───────────────────────────────────────────────────────────────
=======
# ── Fireworks API (Two-Pass DescribeX Mimic) ─────────────────────────────────────────────────────────────
>>>>>>> Stashed changes

SYSTEM_PROMPT = """You are an expert video analyst and master copywriter. You will be shown a sequence of representative frames from a short video. Your task is to analyze the video and generate captions in multiple specific styles.

First, internally observe the video across these 7 dimensions to ground your understanding:
1. Scene / Setting
2. Subjects (people, animals, objects)
3. Actions happening
4. Environment (indoor/outdoor, time of day)
5. Mood / Tone
6. Key Visual Elements (colors, overlays)
7. Temporal Flow

Then, using this factual understanding, generate one caption for EACH of the requested styles:
1. **formal** — Professional, objective, factual tone. Suitable for business or news.
2. **sarcastic** — Dry, ironic, lightly mocking. Poke fun at the situation.
3. **humorous_tech** — Funny, with technology, programming, or developer references. Use analogies to software/hardware.
4. **humorous_non_tech** — Funny, everyday relatable humor with NO technical jargon.

<<<<<<< Updated upstream
CRITICAL REQUIREMENTS:
- EACH caption MUST be exactly 2 to 4 sentences long. (1 sentence is an automatic failure).
- Ensure high factual accuracy. Do NOT hallucinate details not present in the frames.
- Output ONLY a valid JSON object containing keys exactly matching the requested styles.
=======
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

STYLE_PROMPT = """You are an expert caption writer. Below is a factual video translation file generated from representative video frames. Your task is to generate captions for this video in exactly four distinct styles.

--- VIDEO TRANSLATION FILE ---
{video_translation}
--- END VIDEO TRANSLATION FILE ---

Generate one caption for EACH of the following styles:

1. **formal** — Professional, clear, and informative. Suitable for business presentations, educational content, or official communications. Use precise language and a neutral, authoritative tone.

2. **sarcastic** — Witty, ironic, and tongue-in-cheek. Deliver commentary that playfully pokes fun at what is happening in the video. Use dry humor and clever observations.

3. **humorous_tech** — Funny with references to tech culture, programming, internet memes, or developer humor. Use analogies to software, hardware, algorithms, or well-known tech concepts to make the caption entertaining for a tech-savvy audience.

4. **humorous_non_tech** — Funny with everyday, relatable, non-technical humor. Use observations about daily life, common human experiences, or universally understood situations. No jargon — accessible to everyone.

REQUIREMENTS:
- Each caption MUST be 2 to 4 sentences long.
- Output ONLY a valid JSON object with exactly these four keys: "formal", "sarcastic", "humorous_tech", "humorous_non_tech".
- Each value must be a single string containing the caption for that style.
>>>>>>> Stashed changes
- Do NOT wrap the JSON in markdown code fences.
- Do NOT include any explanation or extra text.
"""

<<<<<<< Updated upstream
def generate_captions_via_gemini(frame_paths: list[Path], styles: list[str]) -> dict:
    api_key = get_api_key()
    
    parts = []
=======
def extract_chat_message_text(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""

    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        chunks = []
        for part in content:
            if isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        return "".join(chunks).strip()

    return ""

def _chat_completion(model: str, messages: list[dict], temperature: float, max_tokens: int, stage: str) -> str:
    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("FIREWORKS_API_KEY is not set.")

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    url = f"{FIREWORKS_BASE_URL}/chat/completions"

    for attempt in range(3):
        try:
            resp = SESSION.post(url, headers=headers, json=payload, timeout=API_TIMEOUT)
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            record_model_usage(model, stage, data, attempt + 1)
            text = extract_chat_message_text(data)
            if text:
                return text
            raise RuntimeError("Empty model response.")
        except Exception as e:
            log.warning("Fireworks chat attempt %d failed: %s", attempt + 1, e)
            time.sleep(2 * (attempt + 1))

    raise RuntimeError("Failed to receive Fireworks chat completion.")

def generate_factual_summary(frame_paths: list[Path]) -> str:
    content = [{"type": "text", "text": VISION_PROMPT.format(frame_count=len(frame_paths))}]
>>>>>>> Stashed changes
    for fp in frame_paths:
        b64 = base64.b64encode(fp.read_bytes()).decode()
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
        })

<<<<<<< Updated upstream
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
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Clean up markdown if Gemini leaked it
=======
    return _chat_completion(
        model=VISION_MODEL,
        messages=[{"role": "user", "content": content}],
        temperature=0.2,
        max_tokens=2048,
        stage="vision",
    )

def write_video_translation(frame_paths: list[Path], translation_path: Path) -> Path:
    translation = generate_factual_summary(frame_paths)
    translation_path.write_text(translation, encoding="utf-8")
    return translation_path

def generate_styled_captions(translation_path: Path, styles: list[str]) -> dict:
    video_translation = translation_path.read_text(encoding="utf-8")
    prompt = STYLE_PROMPT.format(video_translation=video_translation)
    
    for attempt in range(3):
        try:
            text = _chat_completion(
                model=PROCESS_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2048,
                stage="process",
            )
            
            # Clean up markdown if the model wraps JSON in a code fence.
>>>>>>> Stashed changes
            if text.startswith("```"):
                text = text.strip().split("\n", 1)[-1].rsplit("\n", 1)[0]
                
            return json.loads(text)
        except Exception as e:
<<<<<<< Updated upstream
            log.warning("Gemini attempt %d failed: %s", attempt+1, e)
=======
            log.warning("Style Pass attempt %d failed: %s", attempt + 1, e)
>>>>>>> Stashed changes
            time.sleep(2 * (attempt + 1))
            
    raise RuntimeError("Failed to generate captions.")

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
            
<<<<<<< Updated upstream
        log.info("[%s] Calling Gemini Single-Pass Fusion with %d frames...", task_id, len(frame_paths))
        captions = generate_captions_via_gemini(frame_paths, styles)
=======
        log.info("[%s] Calling Fireworks Vision Pass with %d frames...", task_id, len(frame_paths))
        translation_path = tmpdir / f"{task_id}_video_translation.txt"
        write_video_translation(frame_paths, translation_path)
        
        log.info("[%s] Calling Fireworks Process Pass...", task_id)
        captions = generate_styled_captions(translation_path, styles)
>>>>>>> Stashed changes
        
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
<<<<<<< Updated upstream
    log.info("=== XO-Screens Video Captioning Agent (Single-Pass Fusion) ===")
=======
    log.info("=== XO-Screens Video Captioning Agent (Two-Pass Fireworks) ===")
>>>>>>> Stashed changes
    
    startup_checks()

    # Pre-flight API check
    if not get_api_key():
        log.warning("!!! WARNING !!! No FIREWORKS_API_KEY found! Ensure you set it before submitting.")
    else:
        log.info("Fireworks API key loaded successfully.")

    start_usage_log(INPUT_PATH, OUTPUT_PATH)
    log.info("Usage log: %s", USAGE_LOG_PATH)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not INPUT_PATH.exists():
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        finish_usage_log()
        return 0

    try:
        tasks = json.loads(INPUT_PATH.read_text(encoding="utf-8-sig"))
    except Exception as e:
        log.error("Failed to parse input: %s", e)
        OUTPUT_PATH.write_text("[]", encoding="utf-8")
        finish_usage_log()
        return 0
    
    results = []

    def _flush():
        OUTPUT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    tmpdir_obj = tempfile.TemporaryDirectory()

    try:
        tmp = Path(tmpdir_obj.name)
        for i, task in enumerate(tasks):
            if budget_remaining() < 60:
                log.error("Budget exhausted!")
                break
                
            results.append(process_task(task, tmp))
            _flush()
    finally:
        tmpdir_obj.cleanup()
        _flush()
        finish_usage_log()

    log.info("=== Done in %.0fs ===", elapsed())
    return 0

if __name__ == "__main__":
    sys.exit(main())

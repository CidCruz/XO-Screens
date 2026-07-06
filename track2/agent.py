"""
Track 2 — Video Captioning Agent
XO-Screens | AMD Developer Hackathon: ACT II

Pipeline:
  1. Read /input/tasks.json
  2. For each video: download → extract frames with ffmpeg → encode to base64
  3. Call Fireworks AI (Gemma 4 31B) — first pass: describe video
  4. Second pass: generate captions in all 4 required styles (parallel)
  5. Write /output/results.json
  6. Exit 0
"""

import os
import sys
import json
import base64
import tempfile
import subprocess
import time
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

# ── Config ────────────────────────────────────────────────────────────────────

API_KEY  = os.environ.get("FIREWORKS_API_KEY", "")
BASE_URL = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1")

# Gemma 4 31B — most capable, used for video captioning
MODEL = "accounts/fireworks/models/gemma-4-31b-it"

INPUT_PATH  = Path("/input/tasks.json")
OUTPUT_PATH = Path("/output/results.json")

MAX_FRAMES      = 12   # frames sampled per video (spread evenly across duration)
FRAME_WIDTH     = 512  # resize width to keep payload small
MAX_RETRIES     = 3
RETRY_DELAY     = 2    # seconds between retries

# ── Style definitions ─────────────────────────────────────────────────────────

STYLES = ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]

STYLE_SYSTEM_PROMPTS = {
    "formal": (
        "You are a professional video captioning assistant. "
        "Write in a clear, neutral, formal register suitable for corporate or academic use. "
        "Be precise, objective, and factual."
    ),
    "sarcastic": (
        "You are a witty, sarcastic video captioning assistant. "
        "Drip every caption with dry sarcasm and sardonic commentary — "
        "but still accurately describe what is actually happening in the video."
    ),
    "humorous_tech": (
        "You are a tech-savvy comedian captioning videos for a developer audience. "
        "Sprinkle in programming jokes, tech buzzwords used ironically, and geek humour — "
        "but remain accurate about the video content. "
        "Reference things like stack overflows, merge conflicts, or deployment failures where fitting."
    ),
    "humorous_non_tech": (
        "You are a stand-up comedian captioning videos for a general audience. "
        "Keep the humour accessible, punny, and light-hearted — absolutely no technical jargon. "
        "Make it feel like a funny narrator at a roast."
    ),
}

CAPTION_PROMPT = """You are given a series of frames sampled from a video, along with a description of the video content.

VIDEO DESCRIPTION:
{description}

Your task: write a single cohesive caption (2-4 sentences) for this video in your assigned style.

The caption must:
- Accurately reflect what is happening in the video
- Be written entirely in your assigned style/tone
- Be engaging and complete — not cut off mid-thought

Return ONLY the caption text. No preamble, no labels, no JSON.
"""

DESCRIBE_PROMPT = """You are given a series of frames sampled evenly from a video clip (30 seconds to 2 minutes long).

Describe the video in detail:
- What is the setting/location?
- Who or what is in the video?
- What actions or events are happening?
- Is there any text visible on screen?
- What is the overall mood or tone?

Be thorough and specific. This description will be used to generate captions.
"""

# ── Fireworks API call ────────────────────────────────────────────────────────

def call_fireworks(messages: list[dict], max_tokens: int = 1024, attempt: int = 0) -> str:
    """Call Fireworks AI chat completions endpoint with retry logic."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": max_tokens,
    }

    try:
        resp = requests.post(
            f"{BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()
    except (requests.HTTPError, requests.Timeout, KeyError) as e:
        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAY * (attempt + 1))
            return call_fireworks(messages, max_tokens, attempt + 1)
        raise RuntimeError(f"Fireworks API failed after {MAX_RETRIES} attempts: {e}") from e


# ── Video download ────────────────────────────────────────────────────────────

def download_video(url: str, dest: Path) -> None:
    """Download a video URL to a local file."""
    print(f"  Downloading: {url}", flush=True)
    try:
        # Try requests first (handles redirects, headers better)
        resp = requests.get(url, stream=True, timeout=120)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
    except Exception:
        # Fallback to urllib
        urllib.request.urlretrieve(url, dest)
    print(f"  Downloaded: {dest.stat().st_size / 1024 / 1024:.1f} MB", flush=True)


# ── Frame extraction ──────────────────────────────────────────────────────────

def extract_frames(video_path: Path, frames_dir: Path, n_frames: int = MAX_FRAMES) -> list[Path]:
    """
    Use ffmpeg to extract n_frames evenly spaced frames from the video.
    Returns list of frame file paths.
    """
    frames_dir.mkdir(parents=True, exist_ok=True)

    # Get video duration first
    probe_cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        str(video_path),
    ]
    try:
        probe_out = subprocess.check_output(probe_cmd, stderr=subprocess.DEVNULL)
        probe_data = json.loads(probe_out)
        duration = float(probe_data["format"]["duration"])
    except Exception:
        duration = 60.0  # fallback assumption

    print(f"  Video duration: {duration:.1f}s, extracting {n_frames} frames", flush=True)

    # Extract frames at evenly spaced timestamps
    frame_paths = []
    interval = duration / (n_frames + 1)

    for i in range(n_frames):
        timestamp = interval * (i + 1)
        out_path = frames_dir / f"frame_{i:03d}.jpg"
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(timestamp),
            "-i", str(video_path),
            "-vframes", "1",
            "-vf", f"scale={FRAME_WIDTH}:-1",
            "-q:v", "3",
            str(out_path),
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0 and out_path.exists():
            frame_paths.append(out_path)

    print(f"  Extracted {len(frame_paths)} frames", flush=True)
    return frame_paths


# ── Frame encoding ────────────────────────────────────────────────────────────

def encode_frames(frame_paths: list[Path]) -> list[dict]:
    """Encode frame images as base64 image_url content parts."""
    parts = []
    for fp in frame_paths:
        with open(fp, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
        })
    return parts


# ── Video description (first pass) ───────────────────────────────────────────

def describe_video(frame_parts: list[dict]) -> str:
    """First pass: get a detailed description of the video from the frames."""
    messages = [
        {"role": "system", "content": "You are a video analysis assistant."},
        {
            "role": "user",
            "content": [
                *frame_parts,
                {"type": "text", "text": DESCRIBE_PROMPT},
            ],
        },
    ]
    return call_fireworks(messages, max_tokens=1024)


# ── Caption generation (second pass) ─────────────────────────────────────────

def generate_caption(style: str, description: str, frame_parts: list[dict]) -> str:
    """Generate a caption for one style."""
    messages = [
        {"role": "system", "content": STYLE_SYSTEM_PROMPTS[style]},
        {
            "role": "user",
            "content": [
                *frame_parts,
                {
                    "type": "text",
                    "text": CAPTION_PROMPT.format(description=description),
                },
            ],
        },
    ]
    return call_fireworks(messages, max_tokens=512)


# ── Process one task ──────────────────────────────────────────────────────────

def process_task(task: dict, tmpdir: Path) -> dict:
    task_id   = task["task_id"]
    video_url = task["video_url"]
    styles    = task.get("styles", STYLES)

    print(f"\n[{task_id}] Processing: {video_url}", flush=True)

    # 1. Download video
    video_path = tmpdir / f"{task_id}.mp4"
    download_video(video_url, video_path)

    # 2. Extract frames
    frames_dir = tmpdir / f"{task_id}_frames"
    frame_paths = extract_frames(video_path, frames_dir)

    if not frame_paths:
        raise RuntimeError(f"No frames extracted from {video_url}")

    # 3. Encode frames
    frame_parts = encode_frames(frame_paths)

    # 4. First pass — describe the video
    print(f"  [{task_id}] Describing video...", flush=True)
    description = describe_video(frame_parts)
    print(f"  [{task_id}] Description: {description[:120]}...", flush=True)

    # 5. Second pass — generate all styles in parallel
    print(f"  [{task_id}] Generating captions for styles: {styles}", flush=True)
    captions = {}

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(generate_caption, style, description, frame_parts): style
            for style in styles
        }
        for future in as_completed(futures):
            style = futures[future]
            try:
                captions[style] = future.result()
                print(f"  [{task_id}] ✓ {style}", flush=True)
            except Exception as e:
                captions[style] = f"[Error generating {style} caption: {e}]"
                print(f"  [{task_id}] ✗ {style}: {e}", flush=True)

    return {"task_id": task_id, "captions": captions}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== XO-Screens Video Captioning Agent (Track 2) ===", flush=True)
    print(f"Model: {MODEL}", flush=True)
    print(f"Base URL: {BASE_URL}", flush=True)

    # Validate API key
    if not API_KEY:
        print("ERROR: FIREWORKS_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    # Read input
    if not INPUT_PATH.exists():
        print(f"ERROR: Input file not found: {INPUT_PATH}", file=sys.stderr)
        sys.exit(1)

    with open(INPUT_PATH) as f:
        tasks = json.load(f)

    print(f"Tasks to process: {len(tasks)}", flush=True)

    # Ensure output directory exists
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    results = []

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        for task in tasks:
            try:
                result = process_task(task, tmp)
                results.append(result)
                print(f"[{task['task_id']}] ✓ Done", flush=True)
            except Exception as e:
                print(f"[{task['task_id']}] ✗ Failed: {e}", file=sys.stderr, flush=True)
                # Still write a result entry so output is valid JSON
                results.append({
                    "task_id": task["task_id"],
                    "captions": {style: f"[Error: {e}]" for style in task.get("styles", STYLES)},
                })

    # Write output
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n=== Done. Results written to {OUTPUT_PATH} ===", flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()

# Track 2 — Video Captioning Agent

**XO-Screens | AMD Developer Hackathon: ACT II**

An AI agent that downloads a video clip, understands what is actually happening in it visually, and generates four stylistically distinct captions — all inside a Docker container, within a 10-minute wall-clock budget.

---

## What the agent does, step by step

### 1. Read `/input/tasks.json`

The judging harness mounts a JSON file at `/input/tasks.json`. Each entry contains a `task_id`, a `video_url` (a direct `.mp4` link, up to 500 MB), and a list of `styles` to generate. The agent reads this file on startup and builds a work queue.

Before touching any video, the agent **pre-seeds `/output/results.json`** with placeholder captions for every task. This means even if the container is killed mid-run by the 10-minute timeout, the output file already exists and is valid JSON — preventing an `OUTPUT_MISSING` or `MISSING_TASKS` disqualification.

---

### 2. Download the video (streaming, 500 MB cap)

The agent streams the video over HTTPS in 4 MB chunks directly to a temp file. It does not buffer the whole file in memory. A `Content-Length` HEAD check runs first — if the server reports the file is over 500 MB, the download is aborted immediately. During streaming, a running byte counter enforces the same cap even if the server lied about the size.

The download has a 150-second timeout. If it fails, the task gets an error caption and the agent moves on — it never crashes the whole run.

---

### 3. Extract frames (ffmpeg, scene-aware)

**Step A — Duration probe:** `ffprobe` reads the video's format metadata to get the exact duration in seconds. This drives how many frames to extract:

| Duration | Target frames |
|---|---|
| ≤ 30 s | 8 |
| ≤ 60 s | 12 |
| > 60 s | 16 |

**Step B — Evenly-spaced frames:** ffmpeg calculates `fps = target_frames / duration` and extracts frames at that rate. Each frame is scaled to 896 px wide (preserving aspect ratio, Lanczos filter) and saved as a JPEG at quality level 3. This gives consistent temporal coverage across the whole clip.

**Step C — Scene-change frames (up to 4 extra):** A second ffmpeg pass uses the `select='gt(scene,0.35)'` filter. This filter computes a perceptual difference score between consecutive frames and fires whenever the score exceeds 0.35 — i.e., at hard visual cuts (a new location, a cut to a different subject, a title card appearing). Up to 4 of these scene-change frames are extracted and added to the pool.

**Hard cap at 20 frames:** If the combined pool exceeds 20 frames, the agent subsamples down to 20. This keeps the base64 payload to the vision model under ~1.4 MB and within context limits.

---

### 4. Vision description pass — Pass 1 (MiniMax M3)

All extracted JPEG frames are base64-encoded and assembled into a single multimodal API request. This is sent to the vision model (default: `accounts/fireworks/models/minimax-m3`, a native multimodal model with 512K context).

The system prompt instructs the model to act as a forensic video analyst and write **6–8 paragraphs of narrative prose** covering:

1. **Setting** — exact location type (indoor/outdoor, urban/rural, specific room type)
2. **Subjects** — every person, animal, or significant object visible, with appearance and clothing details
3. **Actions** — a chronological sequence of what happens, specific about movements and interactions
4. **Atmosphere** — lighting, time of day, weather, emotional tone, pace
5. **Notable details** — signs, text on screen, unusual elements

Temperature is set to `0.1` — as close to deterministic as possible — because this pass is purely factual. The output of this pass is the **single source of truth** that all four caption styles are generated from.

This design means the vision model is called **once per video**, not four times. All four caption styles share the same description. This keeps vision token costs low while maximising quality.

---

### 5. Caption pass — Pass 2 (Kimi K2.6, 4× parallel)

The description from Pass 1 is sent to the text model four times in parallel (one per style), each with its own system prompt and temperature. The four futures run concurrently in a `ThreadPoolExecutor`.

#### Per-style temperature

| Style | Temperature | Why |
|---|---|---|
| `formal` | 0.15 | Documentary narration must be factually consistent and precise. |
| `sarcastic` | 0.75 | Deadpan wit needs creative word choice, grounded in what actually happened. |
| `humorous_tech` | 0.78 | Tech analogies need creative mapping between the visual and the programming concept. |
| `humorous_non_tech` | 0.80 | Stand-up observational humour needs creative variance to land a genuinely funny punchline. |

#### Per-style system prompts

**`formal`** — BBC/National Geographic documentary narrator: active voice, present tense, no bullet points, no clichés, no filler phrases like "we see".

**`sarcastic`** — Bone-dry wit and ironic understatement. No exclamation marks (they kill the deadpan), no "literally". Sarcasm must be anchored to the specific thing shown in the video.

**`humorous_tech`** — Senior developer Twitch commentary. Every tech reference (git commits, merge conflicts, Stack Overflow, "works on my machine", rubber duck debugging) must map onto what is actually happening in the video.

**`humorous_non_tech`** — Stand-up crowd work. Absurdist takes, relatable observations, punny wordplay, "main character energy". Accessible to anyone. Every joke grounded in the specific subject/action/setting shown.

#### Output cleaning

Model outputs are cleaned before being written to results:
- `<think>...</think>` blocks (emitted by reasoning models) are stripped with a regex
- Common preamble phrases are removed: "Here's a formal caption:", "Caption:", "Sure, here is...", etc.
- Leading dashes, asterisks, or quote artifacts are stripped
- Captions under 40 characters are retried up to 5 times with a slight temperature nudge

---

### 6. Write `/output/results.json`

After each task completes, the full results array is written to disk immediately. This means partial results survive a TIMEOUT kill — the judging harness will find a valid JSON file with real captions for tasks that finished and placeholder captions for ones that didn't.

---

## Full pipeline diagram

```
/input/tasks.json
      │
      ▼
 Pre-seed /output/results.json with placeholders (TIMEOUT safety)
      │
      ▼  [for each task]
 Validate task_id, video_url, styles
      │
      ▼
 Stream-download video (150s timeout, 500 MB cap)
      │
      ▼
 Extract frames (ffmpeg)
   ├─ ffprobe → duration
   ├─ evenly-spaced frames (8 / 12 / 16 based on duration)
   ├─ scene-change frames (up to 4) — ffmpeg select='gt(scene,0.35)'
   └─ subsample to ≤ 20 frames total
      │
      ▼
 Base64-encode all JPEG frames
      │
      ▼
 ┌─────────────────────────────────────────┐
 │  PASS 1 — Vision description             │
 │  Model: MiniMax M3                       │
 │  Input: all frames (base64)             │
 │  Temp: 0.1 (factual, deterministic)     │
 │  Output: 6–8 paragraph narrative prose  │
 └─────────────────────────────────────────┘
      │
 ┌────┼────┬────┬────┐
 ▼    ▼    ▼    ▼    ▼
formal  sarcastic  humorous_tech  humorous_non_tech
t=0.15  t=0.75     t=0.78         t=0.80
      │
      └─── all 4 run in parallel (ThreadPoolExecutor)
      │
      ▼
 ┌─────────────────────────────────────────┐
 │  PASS 2 — Caption generation            │
 │  Model: Kimi K2.6                       │
 │  Input: description text only          │
 │  Each style: own system prompt + temp  │
 │  Output: cleaned caption string        │
 └─────────────────────────────────────────┘
      │
      ▼
 Flush /output/results.json (after every task)
```

---

## Budget watchdog

A global 520-second wall-clock timer starts when the agent launches, leaving an 80-second buffer before the 10-minute container limit.

- If budget drops below **60 seconds**: All remaining tasks receive the placeholder caption `"Caption not generated: global time budget exhausted."` and the agent exits cleanly with exit code 0 and valid JSON.

The agent never lets a timeout kill produce missing output.

---

## Disqualification guards

| Failure mode | Guard |
|---|---|
| `PULL_ERROR` | `FROM --platform=linux/amd64` in Dockerfile; image built with `--platform linux/amd64` |
| `RUNTIME_ERROR` | Every exception is caught at the task level; agent always exits 0 |
| `OUTPUT_MISSING` | Results file written with placeholders before any task starts |
| `TIMEOUT` | 520s budget watchdog; graceful fallback captions; ffmpeg and API timeouts |
| `MISSING_TASKS` | Every input task gets an output entry, even on error or budget exhaustion |

---

## Models

| Role | Default model | Why |
|---|---|---|
| Vision (Pass 1) | `accounts/fireworks/models/minimax-m3` | Native multimodal (text + image), 512K context. $0.30/M in, $1.20/M out. |
| Text (Pass 2) | `accounts/fireworks/models/kimi-k2p6` | Strong instruction following and creative writing, 262K context. $0.95/M in, $4.00/M out. |

Both can be overridden via environment variables without rebuilding the image.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREWORKS_API_KEY` | **Yes** | — | Your Fireworks AI API key |
| `FIREWORKS_BASE_URL` | No | `https://api.fireworks.ai/inference/v1` | Base URL for all API calls |
| `VISION_MODEL` | No | `accounts/fireworks/models/minimax-m3` | Vision model for Pass 1 |
| `TEXT_MODEL` | No | `accounts/fireworks/models/kimi-k2p6` | Text model for Pass 2 |
| `TOTAL_BUDGET_SECS` | No | `520` | Global wall-clock budget before graceful exit |

---

## Build

```bash
# From the track2/ directory
# --platform linux/amd64 is required by the judging VM
docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
```

> **Apple Silicon (M1/M2/M3):** `--platform linux/amd64` is mandatory.
> **Intel/AMD machines:** the flag is safe to keep.

---

## Run locally

```bash
# Copy sample input
cp sample_input.json test/input/tasks.json

# Run container
docker run --rm \
  -e FIREWORKS_API_KEY=your_fireworks_api_key \
  -v "$(pwd)/test/input:/input:ro" \
  -v "$(pwd)/test/output:/output" \
  xo-screens-track2:latest

# Inspect results
cat test/output/results.json
```

**Without Docker (local Python):**

```bash
cd track2
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your FIREWORKS_API_KEY

mkdir -p test/input test/output
cp sample_input.json test/input/tasks.json
python agent.py
```

---

## Push to a public registry

```bash
# Docker Hub
docker tag xo-screens-track2:latest yourdockerhubuser/xo-screens-track2:latest
docker push yourdockerhubuser/xo-screens-track2:latest

# GitHub Container Registry
docker tag xo-screens-track2:latest ghcr.io/yourgithubuser/xo-screens-track2:latest
docker push ghcr.io/yourgithubuser/xo-screens-track2:latest
```

---

## I/O contract

### Input — `/input/tasks.json`

```json
[
  {
    "task_id": "v1",
    "video_url": "https://example.com/clip.mp4",
    "styles": ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]
  }
]
```

### Output — `/output/results.json`

```json
[
  {
    "task_id": "v1",
    "captions": {
      "formal": "A tree-lined urban boulevard bathed in autumn gold...",
      "sarcastic": "Oh look, leaves are falling. Groundbreaking stuff.",
      "humorous_tech": "When your CSS gradient finally deploys to production...",
      "humorous_non_tech": "Nature said 'fall aesthetic' and truly committed."
    }
  }
]
```

---

## Example clips (from the spec)

| Clip | URL | Content |
|---|---|---|
| v1 | [link](https://storage.googleapis.com/amd-hackathon-clips/1860079-uhd_2560_1440_25fps.mp4) | Urban autumn boulevard with golden trees and city traffic |
| v2 | [link](https://storage.googleapis.com/amd-hackathon-clips/13825391-uhd_3840_2160_30fps.mp4) | Orange kitten among green foliage in a garden |
| v3 | [link](https://storage.googleapis.com/amd-hackathon-clips/3044693-uhd_3840_2160_24fps.mp4) | Office worker at a desktop computer in a modern open-plan office |

The hidden evaluation set contains ~12 clips spanning varied content: nature, urban, animals, people, sports, food, weather, technology. The pipeline is designed to generalise — it never hardcodes anything about specific clips.

---

## Scoring

Each caption is scored by LLM-Judge on two dimensions:

1. **Caption accuracy (0–1):** how faithfully the caption reflects the actual video content
2. **Style match (0–1):** how well the caption matches the requested tone

Final score = weighted average across all clips and all four styles.

The two-pass design (vision description → styled captions) directly optimises for both dimensions: Pass 1 maximises accuracy by grounding every caption in a detailed factual description; Pass 2 maximises style match by using per-style system prompts and temperatures tuned for each tone.

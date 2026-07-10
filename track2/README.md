# Track 2 — Video Captioning Agent

**XO-Screens | AMD Developer Hackathon: ACT II**

An AI agent that downloads a video clip, understands what is actually happening in it (visually and audibly), and generates four stylistically distinct captions — all inside a Docker container, within a 10-minute wall-clock budget.

---

## What the agent actually does, step by step

### 1. Read `/input/tasks.json`

The judging harness mounts a JSON file at `/input/tasks.json`. Each entry contains a `task_id`, a `video_url` (a direct `.mp4` link, up to 500 MB), and a list of `styles` to generate. The agent reads this file on startup and builds a work queue.

Before touching any video, the agent **pre-seeds `/output/results.json`** with placeholder captions for every task. This means even if the container is killed mid-run by the 10-minute timeout, the output file already exists and is valid JSON — preventing an `OUTPUT_MISSING` or `MISSING_TASKS` disqualification.

---

### 2. Download the video (streaming, 500 MB cap)

The agent streams the video over HTTPS in 4 MB chunks directly to a temp file. It does not buffer the whole file in memory. A `Content-Length` HEAD check runs first — if the server reports the file is over 500 MB, the download is aborted immediately. During streaming, a running byte counter enforces the same cap even if the server lied about the size.

The download has a 150-second timeout. If it fails, the task gets an error caption and the agent moves on — it never crashes the whole run.

---

### 3. Extract frames + transcribe audio (in parallel)

These two operations run simultaneously in a `ThreadPoolExecutor` with 2 workers, so neither blocks the other.

#### Frame extraction (ffmpeg, scene-aware)

**Step A — Duration probe:** `ffprobe` reads the video's format metadata to get the exact duration in seconds. This drives how many frames to extract:

| Duration | Target frames |
|---|---|
| ≤ 30 s | 8 |
| ≤ 60 s | 12 |
> 60 s | 16 |

**Step B — Evenly-spaced frames:** ffmpeg calculates `fps = target_frames / duration` and extracts frames at that rate. Each frame is scaled to 896 px wide (preserving aspect ratio, Lanczos filter) and saved as a JPEG at quality level 3. This gives consistent temporal coverage across the whole clip.

**Step C — Scene-change frames (up to 4 extra):** A second ffmpeg pass uses the `select='gt(scene,0.35)'` filter. This filter computes a perceptual difference score between consecutive frames and fires whenever the score exceeds 0.35 — i.e., at hard visual cuts (a new location, a cut to a different subject, a title card appearing). Up to 4 of these scene-change frames are extracted and added to the pool. This catches transitions that fixed-interval sampling misses entirely — for example, a 60-second clip that cuts between three different scenes would only show one scene in the evenly-spaced frames if the cuts happen to fall between sample points.

**Hard cap at 20 frames:** If the combined pool (evenly-spaced + scene-change) exceeds 20 frames, the agent subsamples down to 20 by picking evenly-spaced indices from the full list. This keeps the base64 payload to the vision model under ~1.4 MB and within context limits.

#### Audio transcription (Whisper tiny, CPU)

The agent runs OpenAI Whisper (`tiny` model, ~39 MB) locally on CPU. It transcribes the video's audio track to plain text. The `tiny` model takes 4–10 seconds per clip on CPU — fast enough to not blow the budget. The `base` model would be more accurate but takes 30–90 seconds per clip, which is too slow when there are ~12 clips to process.

If `ENABLE_WHISPER=false` is set, or if the global time budget is below 120 seconds, transcription is skipped and an empty string is passed downstream. The pipeline never fails because of a missing transcript.

---

### 4. Vision description pass — Pass 1 (Qwen3-VL-32B / MiniMax M3)

All extracted JPEG frames are base64-encoded and assembled into a single multimodal API request alongside the Whisper transcript. This is sent to the vision model (default: `accounts/fireworks/models/minimax-m3`, a native multimodal model with 512K context).

The system prompt instructs the model to act as a professional video analyst and write **4–6 paragraphs of narrative prose** covering:

1. **Setting** — exact location type (indoor/outdoor, urban/rural, specific room type)
2. **Subjects** — every person, animal, or significant object visible, with appearance and clothing details
3. **Actions** — a chronological sequence of what happens, specific about movements and interactions
4. **Atmosphere** — lighting, time of day, weather, emotional tone, pace
5. **Audio cues** — what is said or heard, integrated from the Whisper transcript
6. **Notable details** — signs, text on screen, unusual elements

Temperature is set to `0.1` — as close to deterministic as possible — because this pass is purely factual. The output of this pass is the **single source of truth** that all four caption styles are generated from. Getting this description right is the most important step in the pipeline.

This design means the vision model is called **once per video**, not four times. All four caption styles share the same description. This keeps vision token costs low while maximising the quality of the grounding context.

---

### 5. Caption pass — Pass 2 (Kimi K2.6 / llama4-maverick, 4× parallel)

The description from Pass 1 is sent to the text model four times in parallel (one per style), each with its own system prompt and temperature. The four futures run concurrently in a `ThreadPoolExecutor`.

#### Per-style temperature — why it matters

Temperature controls how "creative" vs "deterministic" the model is. The wrong temperature for a style is one of the most common reasons captions score poorly on style match:

| Style | Temperature | Why |
|---|---|---|
| `formal` | 0.15 | Documentary narration must be factually consistent and precise. High temperature introduces hallucinations and tonal drift. |
| `sarcastic` | 0.85 | Deadpan wit requires creative word choice, but the sarcasm must still be grounded in what actually happened. |
| `humorous_tech` | 0.88 | Tech analogies need creative mapping between the visual and the programming concept. Too low = generic. |
| `humorous_non_tech` | 0.92 | Stand-up observational humour needs the most creative variance to land a genuinely funny punchline. |

#### Per-style system prompts — what each one enforces

**`formal`** — The model is told to write like a BBC or National Geographic documentary narrator: active voice, present tense, no bullet points, no clichés, no filler phrases like "we see" or "the video shows". The first sentence must name the exact setting and subjects; subsequent sentences describe the key actions in sequence.

**`sarcastic`** — The model is told to use bone-dry wit and ironic understatement. Explicit rules: no exclamation marks (they kill the deadpan), no "literally", no "actually" used sincerely. Critically, the sarcasm must be about the specific thing shown in the video — sarcasm about the wrong subject scores zero on accuracy.

**`humorous_tech`** — The model is told to frame everything through a programmer/tech lens using specific references: git commits, merge conflicts, Stack Overflow, "works on my machine", unit tests, deployment pipelines, NullPointerException, rubber duck debugging. The tech reference must map onto what is actually happening in the video — a random tech phrase dropped in without connection to the visual will not land.

**`humorous_non_tech`** — The model is told to do stand-up crowd work with no jargon. Styles to draw from: absurdist takes, relatable everyday observations, punny wordplay, "main character energy". Accessible to anyone aged 15–70. The joke must be grounded in the specific subject/action/setting shown.

#### User prompt — forces grounding

Each caption's user prompt includes the full description from Pass 1 and explicitly requires:
- Accurately reflect the specific content (actual subject, setting, action)
- Stay completely in the requested tone
- Reference at least one specific visual detail from the description
- No generic filler like "a video shows" or "we can see"
- Output the caption text only — no title, label, preamble, markdown, or JSON

#### Output cleaning

Model outputs are cleaned before being written to results:
- `<think>...</think>` blocks (emitted by reasoning models) are stripped with a regex
- Common preamble phrases are removed: "Here's a formal caption:", "Caption:", "Sure, here is...", etc.
- Leading dashes, asterisks, or quote artifacts are stripped
- If the cleaned caption is under 30 characters, the call is retried once with temperature +0.1

---

### 6. Write `/output/results.json`

After each task completes, the full results array is written to disk immediately. This means partial results survive a TIMEOUT kill — the judging harness will find a valid JSON file with real captions for the tasks that finished and placeholder captions for the ones that didn't.

The final flush happens after all tasks are done (or after the budget is exhausted).

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
      ├─────────────────────────────────────┐
      ▼                                     ▼
 Extract frames (ffmpeg)            Transcribe audio (Whisper tiny, CPU)
   ├─ ffprobe → duration                ~4–10s per clip
   ├─ evenly-spaced frames              returns plain text or ""
   │    (8 / 12 / 16 based on duration)
   ├─ scene-change frames (up to 4)
   │    ffmpeg select='gt(scene,0.35)'
   └─ subsample to ≤ 20 frames total
      │                                     │
      └──────────────┬──────────────────────┘
                     ▼
         Base64-encode all JPEG frames
                     │
                     ▼
         ┌─────────────────────────────────────────┐
         │  PASS 1 — Vision description             │
         │  Model: MiniMax M3 (or Qwen3-VL-32B)    │
         │  Input: all frames + Whisper transcript  │
         │  Temp: 0.1 (factual, deterministic)      │
         │  Output: 4–6 paragraph narrative prose   │
         │  covering setting, subjects, actions,    │
         │  atmosphere, audio cues, notable details │
         └─────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┬───────────┐
         ▼           ▼           ▼           ▼
      formal     sarcastic  humorous_tech  humorous_non_tech
      temp=0.15  temp=0.85  temp=0.88     temp=0.92
         │           │           │           │
         └───────────┴───────────┴───────────┘
                     │  (all 4 run in parallel)
                     ▼
         ┌─────────────────────────────────────────┐
         │  PASS 2 — Caption generation             │
         │  Model: Kimi K2.6 (or llama4-maverick)  │
         │  Input: description text only            │
         │  Each style: own system prompt + temp    │
         │  Output: cleaned caption string          │
         └─────────────────────────────────────────┘
                     │
                     ▼
         Flush /output/results.json (after every task)
```

---

## Budget watchdog

A global 520-second wall-clock timer starts when the agent launches. This leaves an 80-second buffer before the 10-minute container limit.

- If budget drops below **120 seconds**: Whisper transcription is skipped for remaining tasks, and frame count is reduced.
- If budget drops below **60 seconds**: All remaining tasks receive the placeholder caption `"Caption not generated: global time budget exhausted."` and the agent exits cleanly with exit code 0 and valid JSON.

The agent never lets a timeout kill produce missing output.

---

## Disqualification guards

| Failure mode | Guard |
|---|---|
| `PULL_ERROR` | `FROM --platform=linux/amd64` in Dockerfile; image built with `--platform linux/amd64` |
| `RUNTIME_ERROR` | Every exception is caught at the task level; agent always exits 0 |
| `OUTPUT_MISSING` | Results file is written with placeholders before any task starts |
| `TIMEOUT` | 520s budget watchdog; graceful fallback captions; ffmpeg and API timeouts |
| `MISSING_TASKS` | Every input task gets an output entry, even on error or budget exhaustion |

---

## Models

| Role | Default model | Why |
|---|---|---|
| Vision (Pass 1) | `accounts/fireworks/models/minimax-m3` | Native multimodal (text + image + video), 512K context, deep semantic fusion across modalities. $0.30/M in, $1.20/M out. |
| Text (Pass 2) | `accounts/fireworks/models/kimi-k2p5` | Strong instruction following and creative writing, 262K context, vision + function-calling capable. $0.95/M in, $4.00/M out. |

Both can be overridden via environment variables without rebuilding the image.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREWORKS_API_KEY` | **Yes** | — | Your Fireworks AI API key |
| `FIREWORKS_BASE_URL` | No | `https://api.fireworks.ai/inference/v1` | Base URL for all API calls |
| `VISION_MODEL` | No | `accounts/fireworks/models/minimax-m3` | Vision model for Pass 1 |
| `TEXT_MODEL` | No | `accounts/fireworks/models/kimi-k2p5` | Text model for Pass 2 |
| `WHISPER_MODEL` | No | `tiny` | Whisper model size: `tiny` / `base` / `small` |
| `ENABLE_WHISPER` | No | `true` | Set to `false` to skip audio transcription |
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

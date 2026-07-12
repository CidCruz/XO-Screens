# Track 2 â€” Video Captioning Agent

**XO-Screens | AMD Developer Hackathon: ACT II**

An AI agent that downloads a video clip, understands what is actually happening in it visually, and generates four stylistically distinct captions â€” all inside a Docker container, within a 10-minute wall-clock budget.

---

## What the agent does, step by step

### 1. Read `/input/tasks.json`

The judging harness mounts a JSON file at `/input/tasks.json`. Each entry contains a `task_id`, a `video_url` (a direct `.mp4` link, up to 500 MB), and a list of `styles` to generate. The agent reads this file on startup and builds a work queue.

The agent writes `/output/results.json` after each task completes. This keeps the output focused on completed work instead of startup placeholders.

---

### 2. Download the video (streaming, 500 MB cap)

The agent streams the video over HTTPS in 4 MB chunks directly to a temp file. It does not buffer the whole file in memory. A `Content-Length` HEAD check runs first â€” if the server reports the file is over 500 MB, the download is aborted immediately. During streaming, a running byte counter enforces the same cap even if the server lied about the size.

The download has a 150-second timeout. If it fails, the task gets an error caption and the agent moves on â€” it never crashes the whole run.

---

### 3. Extract frames (ffmpeg, scene-aware)

**Step A â€” Duration probe:** `ffprobe` reads the video's format metadata to get the exact duration in seconds. This drives how many frames to extract:

| Duration | Target frames |
|---|---|
| â‰¤ 30 s | 8 |
| â‰¤ 60 s | 12 |
| > 60 s | 16 |

**Step B â€” Evenly-spaced frames:** ffmpeg calculates `fps = target_frames / duration` and extracts frames at that rate. Each frame is scaled to 896 px wide (preserving aspect ratio, Lanczos filter) and saved as a JPEG at quality level 3. This gives consistent temporal coverage across the whole clip.

**Step C â€” Scene-change frames (up to 4 extra):** A second ffmpeg pass uses the `select='gt(scene,0.35)'` filter. This filter computes a perceptual difference score between consecutive frames and fires whenever the score exceeds 0.35 â€” i.e., at hard visual cuts (a new location, a cut to a different subject, a title card appearing). Up to 4 of these scene-change frames are extracted and added to the pool.

**Hard cap at 20 frames:** If the combined pool exceeds 20 frames, the agent subsamples down to 20. This keeps the base64 payload to the vision model under ~1.4 MB and within context limits.

---

### 4. Vision description pass â€” Pass 1 (MiniMax M3)

All extracted JPEG frames are base64-encoded and assembled into a single multimodal API request. This is sent to the vision model configured in `model_config.json` (default: `accounts/fireworks/models/kimi-k2p6`).

The system prompt instructs the model to act as a forensic video analyst and write **6â€“8 paragraphs of narrative prose** covering:

1. **Setting** â€” exact location type (indoor/outdoor, urban/rural, specific room type)
2. **Subjects** â€” every person, animal, or significant object visible, with appearance and clothing details
3. **Actions** â€” a chronological sequence of what happens, specific about movements and interactions
4. **Atmosphere** â€” lighting, time of day, weather, emotional tone, pace
5. **Notable details** â€” signs, text on screen, unusual elements

Temperature is set to `0.1` â€” as close to deterministic as possible â€” because this pass is purely factual. The output of this pass is the **single source of truth** that all four caption styles are generated from.

This design means the vision model is called **once per video**, not four times. All four caption styles share the same description. This keeps vision token costs low while maximising quality.

---

### 5. Caption pass â€” Pass 2 (Kimi K2.6, 4Ã— parallel)

The video translation file from Pass 1 is sent to the process model to produce the four requested caption tones.

#### Per-style temperature

| Style | Temperature | Why |
|---|---|---|
| `formal` | 0.15 | Documentary narration must be factually consistent and precise. |
| `sarcastic` | 0.75 | Deadpan wit needs creative word choice, grounded in what actually happened. |
| `humorous_tech` | 0.78 | Tech analogies need creative mapping between the visual and the programming concept. |
| `humorous_non_tech` | 0.80 | Stand-up observational humour needs creative variance to land a genuinely funny punchline. |

#### Per-style system prompts

**`formal`** â€” BBC/National Geographic documentary narrator: active voice, present tense, no bullet points, no clichÃ©s, no filler phrases like "we see".

**`sarcastic`** â€” Bone-dry wit and ironic understatement. No exclamation marks (they kill the deadpan), no "literally". Sarcasm must be anchored to the specific thing shown in the video.

**`humorous_tech`** â€” Senior developer Twitch commentary. Every tech reference (git commits, merge conflicts, Stack Overflow, "works on my machine", rubber duck debugging) must map onto what is actually happening in the video.

**`humorous_non_tech`** â€” Stand-up crowd work. Absurdist takes, relatable observations, punny wordplay, "main character energy". Accessible to anyone. Every joke grounded in the specific subject/action/setting shown.

#### Output cleaning

Model outputs are cleaned before being written to results:
- `<think>...</think>` blocks (emitted by reasoning models) are stripped with a regex
- Common preamble phrases are removed: "Here's a formal caption:", "Caption:", "Sure, here is...", etc.
- Leading dashes, asterisks, or quote artifacts are stripped
- Captions under 40 characters are retried up to 5 times with a slight temperature nudge

---

### 6. Write `/output/results.json`

After each task completes, the full results array is written to disk immediately. This means partial results survive a TIMEOUT kill â€” the judging harness will find a valid JSON file with real captions for tasks that finished and placeholder captions for ones that didn't.

---

## Full pipeline diagram

```
/input/tasks.json
      â”‚
      â–¼
 Write /output/results.json after completed tasks
      â”‚
      â–¼  [for each task]
 Validate task_id, video_url, styles
      â”‚
      â–¼
 Stream-download video (150s timeout, 500 MB cap)
      â”‚
      â–¼
 Extract frames (ffmpeg)
   â”œâ”€ ffprobe â†’ duration
   â”œâ”€ evenly-spaced frames (8 / 12 / 16 based on duration)
   â”œâ”€ scene-change frames (up to 4) â€” ffmpeg select='gt(scene,0.35)'
   â””â”€ subsample to â‰¤ 20 frames total
      â”‚
      â–¼
 Base64-encode all JPEG frames
      â”‚
      â–¼
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚  PASS 1 â€” Vision description             â”‚
 â”‚  Model: MiniMax M3                       â”‚
 â”‚  Input: all frames (base64)             â”‚
 â”‚  Temp: 0.1 (factual, deterministic)     â”‚
 â”‚  Output: 6â€“8 paragraph narrative prose  â”‚
 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
      â”‚
 â”Œâ”€â”€â”€â”€â”¼â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”
 â–¼    â–¼    â–¼    â–¼    â–¼
formal  sarcastic  humorous_tech  humorous_non_tech
t=0.15  t=0.75     t=0.78         t=0.80
      â”‚
      â””â”€â”€â”€ all 4 run in parallel (ThreadPoolExecutor)
      â”‚
      â–¼
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚  PASS 2 â€” Caption generation            â”‚
 â”‚  Model: Kimi K2.6                       â”‚
 â”‚  Input: description text only          â”‚
 â”‚  Each style: own system prompt + temp  â”‚
 â”‚  Output: cleaned caption string        â”‚
 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
      â”‚
      â–¼
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
| `OUTPUT_MISSING` | Results file written after each completed task |
| `TIMEOUT` | 520s budget watchdog; graceful fallback captions; ffmpeg and API timeouts |
| `MISSING_TASKS` | Completed tasks get output entries; errors within a task return fallback captions |

---

## Models

| Role | Default model | Why |
|---|---|---|
| Vision (Pass 1) | `accounts/fireworks/models/kimi-k2p6` | Translates sampled video frames into a temporary video translation file. |
| Process (Pass 2) | `accounts/fireworks/models/deepseek-v4-pro` | Turns the video translation file into captions in the requested tones. |

Both are configured in `model_config.json` and can be overridden via environment variables without rebuilding the image.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREWORKS_API_KEY` | **Yes** | â€” | Your Fireworks AI API key |
| `FIREWORKS_BASE_URL` | No | `https://api.fireworks.ai/inference/v1` | Base URL for all API calls |
| `MODEL_CONFIG_PATH` | No | `model_config.json` | Path to the model config file |
| `VISION_MODEL` | No | `accounts/fireworks/models/kimi-k2p6` | Vision model override for Pass 1 |
| `PROCESS_MODEL` | No | `accounts/fireworks/models/deepseek-v4-pro` | Process model override for Pass 2 |
| `USAGE_LOG_DIR` | No | `token/credits usage` | Directory for per-run token and credit usage JSON files |
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

### Input â€” `/input/tasks.json`

```json
[
  {
    "task_id": "v1",
    "video_url": "https://example.com/clip.mp4",
    "styles": ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]
  }
]
```

### Output â€” `/output/results.json`

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

The hidden evaluation set contains ~12 clips spanning varied content: nature, urban, animals, people, sports, food, weather, technology. The pipeline is designed to generalise â€” it never hardcodes anything about specific clips.

---

## Scoring

Each caption is scored by LLM-Judge on two dimensions:

1. **Caption accuracy (0â€“1):** how faithfully the caption reflects the actual video content
2. **Style match (0â€“1):** how well the caption matches the requested tone

Final score = weighted average across all clips and all four styles.

The two-pass design (vision description â†’ styled captions) directly optimises for both dimensions: Pass 1 maximises accuracy by grounding every caption in a detailed factual description; Pass 2 maximises style match by using per-style system prompts and temperatures tuned for each tone.




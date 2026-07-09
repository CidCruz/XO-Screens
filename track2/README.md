# Track 2 — Video Captioning Agent

**XO-Screens | AMD Developer Hackathon: ACT II**

Watches a video clip and generates captions in 4 distinct styles using Fireworks AI vision and language models.

---

## Pipeline

```
/input/tasks.json
      │
      ▼
 Download video (stream, 500MB cap)
      │
      ├──────────────────────────────┐
      ▼                              ▼
Extract frames                Transcribe audio
(ffmpeg, scene-aware)         (Whisper tiny, CPU)
      │                              │
      └──────────────┬───────────────┘
                     ▼
         Vision description pass
         (Qwen3-VL-32B, temp=0.1)
         Narrative prose, 3–5 paragraphs
                     │
         ┌───────────┼───────────┐───────────┐
         ▼           ▼           ▼           ▼
      formal     sarcastic  humorous_tech  humorous_non_tech
     temp=0.15   temp=0.85   temp=0.88     temp=0.92
    (llama4-maverick, parallel)
         │
         ▼
/output/results.json
```

---

## Styles supported

| Style | Description | Temperature |
|---|---|---|
| `formal` | BBC documentary narrator — precise, authoritative, active voice | 0.15 |
| `sarcastic` | Bone-dry wit, ironic understatement, sardonic commentary | 0.85 |
| `humorous_tech` | Developer Twitch commentary — git jokes, Stack Overflow refs, "works on my machine" | 0.88 |
| `humorous_non_tech` | Stand-up crowd work — punny, observational, accessible to everyone | 0.92 |

---

## Key design decisions

### Per-style temperature
Formal captions use `temp=0.15` for factual consistency. Humorous captions use `temp=0.88–0.92` for creative variance. This is what separates good style match scores from generic ones.

### Two-pass pipeline
**Pass 1 (vision):** All frames + audio transcript → one detailed narrative description from Qwen3-VL-32B.
**Pass 2 (text):** That description → 4 captions generated in parallel by llama4-maverick, each with its own system prompt and temperature.

This keeps vision token costs to one call per video while maximising caption quality.

### Scene-change frame sampling
In addition to evenly-spaced frames, ffmpeg's `select='gt(scene,0.35)'` filter extracts up to 4 frames at hard visual cuts. This catches scene transitions that fixed-interval sampling misses entirely.

### Budget watchdog
A global 520-second wall-clock timer prevents TIMEOUT disqualifications. If the budget drops below 60 seconds, remaining tasks receive placeholder captions and the agent exits cleanly with exit code 0 and valid JSON.

### Whisper tiny
Default model is `tiny` (~4–10s per clip on CPU) vs `base` (~30–90s). The eval set has ~12 clips — timing matters more than marginal transcript accuracy.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREWORKS_API_KEY` | **Yes** | — | Your Fireworks AI API key (Track 2 uses your own credentials) |
| `FIREWORKS_BASE_URL` | No | `https://api.fireworks.ai/inference/v1` | Base URL for all API calls |
| `VISION_MODEL` | No | `accounts/fireworks/models/qwen3-vl-32b-instruct` | Vision model for description pass |
| `TEXT_MODEL` | No | `accounts/fireworks/models/llama4-maverick-instruct-basic` | Text model for caption pass (`-basic` = free serverless tier) |
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

# Create test dirs and copy sample input
mkdir -p test/input test/output
cp sample_input.json test/input/tasks.json

# Temporarily mount paths for local run
INPUT_PATH can be overridden by editing agent.py INPUT_PATH for local testing
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

---

## Scoring

Each caption is scored by LLM-Judge on two dimensions:

1. **Caption accuracy (0–1):** how faithfully the caption reflects the video content
2. **Style match (0–1):** how well the caption matches the requested tone

Final score = weighted average across all clips and all four styles.

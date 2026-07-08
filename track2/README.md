# Track 2 — Video Captioning Agent

**XO-Screens | AMD Developer Hackathon: ACT II**

Watches a video clip and generates captions in 4 styles using Fireworks AI vision models.

---

## How it works

1. Reads `/input/tasks.json` — list of video URLs + requested styles
2. Downloads each video (up to 500 MB) to a temp directory
3. Extracts **8 evenly-spaced JPEG frames** with a single `ffmpeg` invocation
4. **First pass** — sends all frames to a vision model to produce a detailed description
5. Deletes frames and video from disk immediately after description to free space
6. **Second pass** — generates captions for all requested styles in parallel (ThreadPoolExecutor)
7. Every requested style is guaranteed an entry in the output — no silent drops
8. Writes `/output/results.json` — one entry per task with captions for every requested style
9. Exits with code `0`

---

## Styles supported

| Style | Description |
|---|---|
| `formal` | Professional, objective, factual tone |
| `sarcastic` | Dry, ironic, lightly mocking |
| `humorous_tech` | Funny with programming/tech references |
| `humorous_non_tech` | Funny, everyday humour, no technical jargon |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `FIREWORKS_API_KEY` | **Yes** | Your Fireworks AI API key — use your own credentials for Track 2 |
| `FIREWORKS_BASE_URL` | No | Override the Fireworks base URL (default: `https://api.fireworks.ai/inference/v1`) |
| `VISION_MODEL` | No | Override the vision model (default: `qwen2p5-vl-72b-instruct`) |
| `TEXT_MODEL` | No | Override the text model (default: `llama4-scout-instruct-basic`) |

> **Note:** Track 2 has no `ALLOWED_MODELS` restriction — you may use any model, API, or framework with your own credentials inside the container.

---

## Build

```bash
# From the track2/ directory — linux/amd64 required by judging VM
docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
```

> **Apple Silicon (M1/M2/M3):** the `--platform linux/amd64` flag is mandatory.
> **Intel/AMD machines:** the flag is harmless to keep.

---

## Run locally

```bash
# Copy sample input
cp sample_input.json test/input/tasks.json

# Run — only FIREWORKS_API_KEY is required
docker run --rm \
  -e FIREWORKS_API_KEY=your_fireworks_api_key \
  -v "$(pwd)/test/input:/input:ro" \
  -v "$(pwd)/test/output:/output" \
  xo-screens-track2:latest

# Inspect results
cat test/output/results.json
```

For local development outside Docker, copy `.env.example` to `.env` and fill in your key, then run:

```bash
pip install -r requirements.txt
# Set FIREWORKS_API_KEY in your shell or .env, then:
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
      "formal": "...",
      "sarcastic": "...",
      "humorous_tech": "...",
      "humorous_non_tech": "..."
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

Each caption is scored by LLM-Judge on:
1. **Caption accuracy** (0–1): how faithfully the caption reflects the video content
2. **Style match** (0–1): how well the caption matches the requested tone

Final score = weighted average across all clips and all requested styles.

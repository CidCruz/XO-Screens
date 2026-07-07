# Track 2 — Video Captioning Agent

**XO-Screens | AMD Developer Hackathon: ACT II**

Generates video captions in 4 styles using **Fireworks AI** (Gemma 4 31B IT running on AMD hardware).

---

## How it works

1. Reads `/input/tasks.json` — list of video URLs + requested styles
2. Downloads each video to a temp directory
3. Extracts **12 evenly-spaced JPEG frames** with `ffmpeg` / `ffprobe`
4. **First pass** — calls Fireworks AI to produce a detailed video description from the frames
5. **Second pass** — generates captions in all 4 styles in parallel (ThreadPoolExecutor)
6. Writes `/output/results.json` — one entry per task with captions for every style
7. Exits with code `0`

Model selection is read from the `ALLOWED_MODELS` environment variable at runtime — no model IDs are hardcoded in the image. When `ALLOWED_MODELS` is set, the agent selects the most capable available model (prefers `31b` > `26b` > first entry).

---

## Styles supported

| Style | Description |
|---|---|
| `formal` | Professional, objective, factual tone |
| `sarcastic` | Dry, ironic, lightly mocking |
| `humorous_tech` | Funny with programming/tech references |
| `humorous_non_tech` | Funny, everyday humour, no technical jargon |

---

## Build

```bash
# From the track2/ directory — linux/amd64 required by judging VM
docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
```

> **Apple Silicon (M1/M2/M3):** the `--platform linux/amd64` flag is mandatory.  
> **Intel/AMD machines:** this flag is fine to keep, it's a no-op on native amd64.

---

## Run locally

```bash
# Create test directories
mkdir -p test/input test/output

# Copy the provided sample input
cp sample_input.json test/input/tasks.json

# Run — injecting the three env vars the harness will provide
docker run --rm \
  -e FIREWORKS_API_KEY=your_fireworks_api_key \
  -e FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1 \
  -e ALLOWED_MODELS=accounts/fireworks/models/gemma-4-31b-it \
  -v "$(pwd)/test/input:/input" \
  -v "$(pwd)/test/output:/output" \
  xo-screens-track2:latest

# Inspect results
cat test/output/results.json
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

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `FIREWORKS_API_KEY` | **Yes** | Injected by harness — use this key, not your own |
| `FIREWORKS_BASE_URL` | **Yes** | All API calls route through this URL — required for proxy recording |
| `ALLOWED_MODELS` | **Yes** | Comma-separated list of permitted model IDs — agent selects best available |

> **Important:** All API calls go through `FIREWORKS_BASE_URL`. Calls that bypass it score zero tokens. Model IDs are read from `ALLOWED_MODELS` at runtime — nothing is hardcoded.

---

## Example clips (from the spec)

| Clip | URL | Content |
|---|---|---|
| v1 | [link](https://storage.googleapis.com/amd-hackathon-clips/1860079-uhd_2560_1440_25fps.mp4) | Urban autumn boulevard |
| v2 | [link](https://storage.googleapis.com/amd-hackathon-clips/13825391-uhd_3840_2160_30fps.mp4) | Orange kitten in garden |
| v3 | [link](https://storage.googleapis.com/amd-hackathon-clips/3044693-uhd_3840_2160_24fps.mp4) | Office worker at desktop |

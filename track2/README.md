# Track 2 — Video Captioning Agent

**XO-Screens | AMD Developer Hackathon: ACT II**

Generates video captions in 4 styles using **Fireworks AI** (Gemma 4 31B IT) running on **AMD hardware**.

## How it works

1. Reads `/input/tasks.json` — list of video URLs + requested styles
2. Downloads each video and extracts 12 evenly-spaced frames using **ffmpeg**
3. Calls **Fireworks AI (Gemma 4 31B IT)** — first pass to describe the video, second pass to generate captions in all 4 styles in parallel
4. Writes `/output/results.json` — one entry per task with captions for every style
5. Exits with code 0

## Styles supported

| Style | Description |
|---|---|
| `formal` | Professional, objective, factual tone |
| `sarcastic` | Dry, ironic, lightly mocking |
| `humorous_tech` | Funny with programming/tech references |
| `humorous_non_tech` | Funny, everyday humour, no jargon |

## Build

```bash
# From the track2/ directory
docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
```

> If building on Apple Silicon (M1/M2/M3), the `--platform linux/amd64` flag is required.
> On Intel/AMD machines it works without changes.

## Run locally (test)

```bash
# Create test directories
mkdir -p test/input test/output

# Copy sample input
cp sample_input.json test/input/tasks.json

# Run container
docker run --rm \
  -e FIREWORKS_API_KEY=your_fireworks_api_key \
  -v $(pwd)/test/input:/input \
  -v $(pwd)/test/output:/output \
  xo-screens-track2:latest

# Check results
cat test/output/results.json
```

## Push to registry

```bash
# Docker Hub
docker tag xo-screens-track2:latest yourdockerhubuser/xo-screens-track2:latest
docker push yourdockerhubuser/xo-screens-track2:latest

# OR GitHub Container Registry
docker tag xo-screens-track2:latest ghcr.io/yourgithubuser/xo-screens-track2:latest
docker push ghcr.io/yourgithubuser/xo-screens-track2:latest
```

## Input format

```json
[
  {
    "task_id": "v1",
    "video_url": "https://example.com/clip.mp4",
    "styles": ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]
  }
]
```

## Output format

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

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `FIREWORKS_API_KEY` | Yes | Your Fireworks AI API key |
| `FIREWORKS_BASE_URL` | No | Defaults to `https://api.fireworks.ai/inference/v1` |

## Model

- **Gemma 4 31B IT** (`accounts/fireworks/models/gemma-4-31b-it`)
- Hosted on AMD hardware via Fireworks AI
- Most capable Gemma 4 variant — chosen for video understanding quality

# XO-Screens

AI-powered desktop overlay and video captioning demo for the AMD Developer Hackathon ACT II.

## Before you start

Make sure you have these ready:

- Node.js 18+ and npm
- Docker (if you want to run Track 2 in a container)
- Python 3 and pip (if you want to run Track 2 locally without Docker)
- A Fireworks AI API key

## What this project includes

- App UI: a React + Electron experience with an AI chat overlay, notes, and a built-in video summarization feature.
- Track 2: a separate captioning pipeline that generates four stylized captions from video input. This is different from the app's in-app summarization feature.

## How to try it

### 1) Explore the app UI

This project has two frontend entry points:

- `index.web.html` — browser-based UI
- `index.html` — desktop/Electron UI

Run the app with:

```bash
npm install
npm run dev          # browser UI at http://localhost:5174/index.web.html
npm run dev:desktop  # desktop overlay using index.html
```

Optional: set a Fireworks API key in a root `.env` file:

```bash
VITE_FIREWORKS_API_KEY=your_key
```

### 2) Test Track 2 in multiple ways

Track 2 can be tested with Docker, or directly with Python if you prefer not to use containers.

#### Option A: Docker (fastest)

```bash
cd track2
cp sample_input.json test/input/tasks.json

docker run --rm \
  -e FIREWORKS_API_KEY=your_api_key \
  -v "$(pwd)/test/input:/input:ro" \
  -v "$(pwd)/test/output:/output" \
  v3rdenherre/xo-screens-track2:latest
```

Results will be written to `track2/test/output/results.json`.

#### Option B: Local Python

```bash
cd track2
pip install -r requirements.txt
cp sample_input.json test/input/tasks.json
python agent.py
```

#### Option C: Build the Docker image locally

```bash
cd track2
docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
```

## Repo layout

- `src/` — app UI and main logic
- `electron/` — Electron desktop shell
- `track2/` — captioning agent and Docker setup

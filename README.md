# XO-Screens

AI-powered desktop overlay and video captioning demo for the AMD Developer Hackathon ACT II.

## Before you start

Make sure you have these ready:

- Node.js 18+ and npm
- Docker (if you want to run Track 2 in a container)
- Python 3 and pip (if you want to run Track 2 locally without Docker)
- A Gemini API key (primary) and/or a Fireworks AI API key (fallback)

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

Optional: if you do not want to use the app's built-in BYOK feature, you can also set the key in a root `.env` file:

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
  -e GEMINI_API_KEY=your_gemini_key \
  -e FIREWORKS_API_KEY=your_fireworks_key \
  -v "$(pwd)/test/input:/input:ro" \
  -v "$(pwd)/test/output:/output" \
  v3rdenherre/xo-screens-track2:latest
```

> At least one API key is required. Gemini is the primary inference engine; Fireworks is the fallback.

Results will be written to `track2/test/output/results.json`.

#### Option B: Local Python

```bash
cd track2
pip install -r requirements.txt
cp .env.example .env
# Edit .env and fill in your API keys

cp sample_input.json test/input/tasks.json
python agent.py
```

#### Option C: Build the Docker image locally

```bash
cd track2
docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
```

Then run with Option A but replace the image name with `xo-screens-track2:latest`.

#### PowerShell (Windows)

```powershell
cd C:\Users\kumir\Downloads\XO-Screens\track2

$env:GEMINI_API_KEY="your_gemini_key"
$env:FIREWORKS_API_KEY="your_fireworks_key"

New-Item -ItemType Directory -Path test/input -Force | Out-Null
New-Item -ItemType Directory -Path test/output -Force | Out-Null
Copy-Item sample_input.json test/input/tasks.json -Force

docker run --rm `
  -e GEMINI_API_KEY=$env:GEMINI_API_KEY `
  -e FIREWORKS_API_KEY=$env:FIREWORKS_API_KEY `
  -v "${PWD}/test/input:/input:ro" `
  -v "${PWD}/test/output:/output" `
  xo-screens-track2:latest
```

## Repo layout

- `src/` — app UI and main logic
- `electron/` — Electron desktop shell
- `track2/` — captioning agent and Docker setup

# XO-Screens — AMD Developer Hackathon: ACT II

An AI-powered desktop overlay and video captioning agent built for the AMD Developer Hackathon.

---

## Tracks

| Track | Description |
|---|---|
| **Track 1** | Electron + React + TypeScript desktop app — a floating AI assistant overlay with chat, video summarizer, notes, and usage tracking |
| **Track 2** | Dockerised video captioning agent — downloads video clips and generates 4 stylistically distinct captions using a two-pass vision + text AI pipeline |

---

## Track 1 — Desktop Overlay App

A floating widget that stays on top of all windows. Ships with **two separate UIs** — a browser web app and a native Electron desktop overlay — both powered by the same React + TypeScript codebase.

### Tech stack

- React 19 + TypeScript
- Vite 8 (dual-mode: `web` and `desktop`)
- Tailwind CSS v4
- Electron 43
- Fireworks AI (OpenAI-compatible API) — chat and video analysis

### Features

- **AI Chat** — conversational assistant powered by Fireworks AI (`deepseek-v4-pro`). Supports multi-turn chat sessions with history, per-session titles, and the ability to delete sessions. The AI can control the app via tool calls (open/close widgets, read/write notes, check caption history).
- **Chat Capabilities panel** — toggle which app-control tools the AI has access to (widget control, read notes, write notes, caption history). Disabled capabilities are never sent to the model.
- **Video Summarizer** — upload a local video file or paste a direct video URL. The app extracts up to 20 frames using a perceptual deduplication algorithm, sends them to a vision model (`minimax-m3`) for a detailed frame-by-frame inventory, synthesizes a narrative description, then generates 4 styled summaries in parallel. Supports MP4, WEBM, MOV, AVI, MKV.
- **4 caption styles** — Formal (documentary), Sarcastic (deadpan), Humorous Tech (developer commentary), Humorous Non-Tech (stand-up observational). Each style uses a tuned temperature and system prompt.
- **Caption History** — all generated video summaries are saved locally and can be reloaded or saved to Notes.
- **Notes app** — create, edit, and delete rich text notes. Notes are persisted in localStorage. The AI can read and write notes via tool calls.
- **Usage Tracking** — tracks chat messages, video files processed, captions generated, and feature usage. Displayed in a dashboard panel.
- **Draggable + resizable widget** — the overlay can be dragged anywhere on screen and resized from any corner.
- **BYOK (Bring Your Own Key)** — no `.env` file required. Paste your Fireworks AI API key directly in the app's Settings panel. The key is stored in localStorage.

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### API key

No `.env` file is required. The app has a built-in Settings panel where you paste your [Fireworks AI](https://fireworks.ai) API key. It is stored in your browser's localStorage.

To pre-fill the key instead, create a `.env` file in the project root:

```
VITE_FIREWORKS_API_KEY=your_fireworks_api_key
```

---

## UI 1 — Browser Web App

The full app running in any browser tab. Uses `index.web.html` as the entry point and runs on port `5174`.

### Run in dev mode

```bash
npm run dev
```

Opens automatically at `http://localhost:5174/index.web.html`

### Build for production

```bash
npm run build
```

Output goes to `dist-web/`

---

## UI 2 — Electron Desktop Overlay

A native floating window that stays on top of all other applications. Uses `index.html` as the entry point and runs on port `5173`. Launched via Electron.

### Run in dev mode

Starts Vite on port 5173 and launches Electron automatically:

```bash
npm run dev:desktop
```

### Build desktop bundle

```bash
npm run build:desktop
```

Output goes to `dist/`

### Package into installable `.exe`

```bash
npm run electron:build
```

Output goes to `release/`

---

## All Track 1 commands

| Command | What it does |
|---|---|
| `npm install` | Install all dependencies |
| `npm run dev` | Browser web app at `localhost:5174` |
| `npm run dev:desktop` | Electron overlay in dev mode |
| `npm run build` | Build browser UI → `dist-web/` |
| `npm run build:desktop` | Build desktop bundle → `dist/` |
| `npm run electron:build` | Package into installable `.exe` → `release/` |

---

## Track 2 — Video Captioning Agent

A Docker container that reads a list of video tasks from `/input/tasks.json`, downloads each clip, and generates 4 caption styles using a two-pass AI pipeline.

### How it works

1. Reads `/input/tasks.json` on startup and pre-seeds `/output/results.json` with placeholder captions for every task — so even if the container is killed by the 10-minute timeout, the output file already exists and is valid JSON.
2. For each task: streams the video (up to 500 MB), extracts 8–16 frames with ffmpeg (plus up to 4 scene-change frames), base64-encodes them, and sends them to a vision model.
3. **Pass 1 (Vision)** — `minimax-m3` produces a detailed 6–8 paragraph narrative description of the video.
4. **Pass 2 (Captions)** — `kimi-k2p6` generates all 4 caption styles in parallel from the description, each with its own system prompt and temperature.
5. Results are written to `/output/results.json` after every task.

### Requirements

- Docker
- A [Fireworks AI](https://fireworks.ai) API key

### Quick start

```bash
cd track2

# Copy sample input
cp sample_input.json test/input/tasks.json

# Run using the pre-built Docker Hub image
docker run --rm \
  -e FIREWORKS_API_KEY=your_api_key \
  -v "$(pwd)/test/input:/input:ro" \
  -v "$(pwd)/test/output:/output" \
  v3rdenherre/xo-screens-track2:latest

# View results
cat test/output/results.json
```

> Windows (cmd): replace `$(pwd)` with `%cd%`
> Windows (PowerShell): replace `$(pwd)` with `${PWD}`

### Build from source

```bash
cd track2
docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
```

> `--platform linux/amd64` is required by the judging VM. Safe to keep on Intel/AMD machines.

### Docker Hub image

```
v3rdenherre/xo-screens-track2:latest
```

### Caption styles

| Style | Tone | Temperature |
|---|---|---|
| `formal` | BBC/National Geographic documentary narrator | 0.15 |
| `sarcastic` | Bone-dry deadpan wit, ironic understatement | 0.75 |
| `humorous_tech` | Senior developer Twitch commentary | 0.78 |
| `humorous_non_tech` | Stand-up observational humour | 0.80 |

### Input format (`/input/tasks.json`)

```json
[
  {
    "task_id": "v1",
    "video_url": "https://example.com/clip.mp4",
    "styles": ["formal", "sarcastic", "humorous_tech", "humorous_non_tech"]
  }
]
```

### Output format (`/output/results.json`)

```json
[
  {
    "task_id": "v1",
    "captions": {
      "formal": "Golden late-afternoon light washes over...",
      "sarcastic": "Oh look, leaves are falling. Groundbreaking.",
      "humorous_tech": "When your CI/CD pipeline finally deploys...",
      "humorous_non_tech": "Nature said 'fall aesthetic' and committed."
    }
  }
]
```

See [`track2/README.md`](track2/README.md) for the full pipeline documentation including the budget watchdog, disqualification guards, and frame extraction details.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREWORKS_API_KEY` | Yes | — | Your Fireworks AI API key |
| `FIREWORKS_BASE_URL` | No | `https://api.fireworks.ai/inference/v1` | API base URL |
| `VISION_MODEL` | No | `accounts/fireworks/models/minimax-m3` | Vision model for Pass 1 |
| `TEXT_MODEL` | No | `accounts/fireworks/models/kimi-k2p6` | Text model for Pass 2 |
| `TOTAL_BUDGET_SECS` | No | `520` | Wall-clock budget before graceful exit |

# ── Track 2: Video Captioning Agent ──────────────────────────────────────────
# XO-Screens | AMD Developer Hackathon: ACT II
#
# Disqualification prevention:
#   PULL_ERROR     — FROM --platform=linux/amd64, build with --platform linux/amd64
#   RUNTIME_ERROR  — every exception caught; always exits 0 with valid JSON output
#   OUTPUT_MISSING — output written immediately on startup, flushed after every task
#   TIMEOUT        — 520s budget watchdog; ffmpeg/API hard timeouts; Whisper pre-cached
#   MISSING_TASKS  — results pre-seeded for all tasks before processing starts
#
# Build (linux/amd64 required by judging VM):
#   docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
#
# Run locally:
#   docker run --rm \
#     -e FIREWORKS_API_KEY=your_key \
#     -v "$(pwd)/test/input:/input:ro" \
#     -v "$(pwd)/test/output:/output" \
#     xo-screens-track2:latest

FROM --platform=linux/amd64 python:3.11-slim

# Disable healthcheck — we're a batch container, not a service
HEALTHCHECK NONE

# Install ffmpeg + ffprobe in a single layer, clean apt cache immediately
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper tiny model weights into the image layer.
# This means zero network activity at evaluation time and no cold-start penalty.
# tiny = ~75MB on disk, ~4-10s per clip on CPU.
RUN python -c "import whisper; whisper.load_model('tiny'); print('Whisper tiny cached OK')"

# Copy agent source last — changing agent.py only rebuilds this layer
COPY agent.py .

# Create I/O mount points, run as non-root for security
RUN mkdir -p /input /output && \
    useradd -r -u 1001 -s /sbin/nologin agent && \
    chown -R agent:agent /input /output /app

USER agent

# -u = unbuffered stdout so logs appear immediately in docker logs
CMD ["python", "-u", "agent.py"]

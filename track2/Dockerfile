# ── Track 2: Video Captioning Agent ──────────────────────────────────────────
# XO-Screens | AMD Developer Hackathon: ACT II
#
# Build (linux/amd64 — required by judging VM):
#   docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
#
# Run locally (see README.md for full instructions):
#   docker run --rm \
#     -e FIREWORKS_API_KEY=your_key \
#     -v $(pwd)/test/input:/input:ro \
#     -v $(pwd)/test/output:/output \
#     xo-screens-track2:latest

FROM --platform=linux/amd64 python:3.11-slim

# Install ffmpeg + ffprobe
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps — whisper pulls torch, cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper base model into the image — no download at eval time
RUN python -c "import whisper; whisper.load_model('base')"

# Copy agent
COPY agent.py .

# Create I/O mount points and a non-root user for security
RUN mkdir -p /input /output && \
    useradd -r -u 1001 -s /sbin/nologin agent && \
    chown agent:agent /input /output /app

USER agent

CMD ["python", "-u", "agent.py"]

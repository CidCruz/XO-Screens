# ── Track 2: Video Captioning Agent ──────────────────────────────────────────
# XO-Screens | AMD Developer Hackathon: ACT II
#
# Build (linux/amd64 — required by judging VM):
#   docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
#
# Run locally:
#   docker run --rm \
#     -e FIREWORKS_API_KEY=your_key \
#     -e FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1 \
#     -e ALLOWED_MODELS=accounts/fireworks/models/gemma-4-31b-it \
#     -v $(pwd)/test/input:/input \
#     -v $(pwd)/test/output:/output \
#     xo-screens-track2:latest

FROM --platform=linux/amd64 python:3.11-slim

# Install ffmpeg + ffprobe (ffprobe is included in the ffmpeg package)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached unless requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent
COPY agent.py .

# Ensure I/O mount points exist
RUN mkdir -p /input /output

# Run agent on container start
CMD ["python", "-u", "agent.py"]

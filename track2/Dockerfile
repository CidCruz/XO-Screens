# ── Track 2: Video Captioning Agent ──────────────────────────────────────────
# XO-Screens | AMD Developer Hackathon: ACT II
#
# Build:  docker buildx build --platform linux/amd64 -t xo-screens-track2:latest .
# Run:    docker run --rm \
#           -e FIREWORKS_API_KEY=your_key \
#           -v $(pwd)/input:/input \
#           -v $(pwd)/output:/output \
#           xo-screens-track2:latest

FROM python:3.11-slim

# Install ffmpeg (required for frame extraction)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent
COPY agent.py .

# Create I/O directories
RUN mkdir -p /input /output

# Run agent on container start
CMD ["python", "-u", "agent.py"]

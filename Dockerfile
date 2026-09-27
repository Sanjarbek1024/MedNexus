# One container for the whole app: the API serves the built web app on $PORT.
# Build: docker build -t mednexus .    Run: docker run -p 8000:8000 -e GROQ_API_KEY=... mednexus

FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/app/data \
    WEIGHTS_DIR=/app/weights \
    STATIC_DIR=/app/static \
    PORT=8000 \
    SEED_DEMO=1

# OpenCV (a pytorch-grad-cam dependency) needs these shared libraries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.0 torchvision==0.29.0 \
    && pip install -r requirements.txt

RUN useradd --create-home --home-dir /home/mednexus --uid 1000 mednexus \
    && mkdir -p /app/data /app/weights && chown -R mednexus:mednexus /app
USER mednexus
ENV HOME=/home/mednexus

# Model weights: shipped from backend/weights when present (folder upload), downloaded below otherwise.
COPY --chown=mednexus:mednexus backend/weights ./weights
COPY --chown=mednexus:mednexus backend/analyzers.yaml backend/alembic.ini ./
COPY --chown=mednexus:mednexus backend/migrations ./migrations
COPY --chown=mednexus:mednexus backend/app ./app
RUN python -c "import torch; from app.config import get_settings; from app.analyzers import weights; from app.analyzers.registry import AnalyzerRegistry; AnalyzerRegistry.from_yaml(get_settings().registry_path).load(torch.device('cpu'))"

# Demo data (doctor account + six sample cases) and the web app.
COPY --chown=mednexus:mednexus scripts ./scripts
COPY --chown=mednexus:mednexus frontend/public/samples ./frontend/public/samples
COPY --from=web --chown=mednexus:mednexus /web/dist ./static

EXPOSE 8000
# First start with an empty database adds the demo doctor and the sample cases, then the API starts.
CMD ["sh", "-c", "if [ \"$SEED_DEMO\" = \"1\" ]; then python scripts/seed_demo.py --samples --if-empty || true; fi; exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --proxy-headers --forwarded-allow-ips='*'"]

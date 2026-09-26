FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/app/data

# OpenCV (a pytorch-grad-cam dependency) needs these shared libraries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.0 torchvision==0.29.0 \
    && pip install -r requirements.txt

# The API runs unprivileged: it can write only its data directory (uploads) and its home.
RUN useradd --create-home --home-dir /home/mednexus --uid 1000 mednexus \
    && mkdir -p /app/data && chown mednexus:mednexus /app/data

USER mednexus
ENV HOME=/home/mednexus

# Model weights live in /app/weights (WEIGHTS_DIR). A folder upload that includes backend/weights
# (~1 GB) ships them in their own layer; anything missing (e.g. a GitHub build) downloads below.
ENV WEIGHTS_DIR=/app/weights
COPY --chown=mednexus:mednexus weights ./weights

# Migrations run at startup, so the image needs them next to the app.
COPY analyzers.yaml alembic.ini ./
COPY migrations ./migrations
COPY app ./app

# Loading every analyzer fetches missing weights and fails the build early if a model cannot load.
RUN python -c "import torch; from app.config import get_settings; from app.analyzers import weights; from app.analyzers.registry import AnalyzerRegistry; AnalyzerRegistry.from_yaml(get_settings().registry_path).load(torch.device('cpu'))"

EXPOSE 8000
# Client IPs and the scheme come from the nginx proxy's X-Forwarded-* headers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]

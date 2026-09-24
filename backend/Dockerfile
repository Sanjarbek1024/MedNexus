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

COPY analyzers.yaml ./
COPY app ./app

# Bake the model weights into the image so the container starts offline and fast.
RUN python -c "import torch; from app.config import get_settings; \
from app.analyzers.registry import AnalyzerRegistry; \
AnalyzerRegistry.from_yaml(get_settings().registry_path).load(torch.device('cpu'))"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

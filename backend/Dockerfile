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

# Model weights first, in their own layer, so code changes do not re-download ~670 MB. They land
# in the runtime user's ~/.torchxrayvision, where the app's loaders find them.
COPY analyzers.yaml ./
RUN python -c "import pathlib, urllib.request, yaml, torchxrayvision as xrv; xrv.models.DenseNet(weights='densenet121-res224-all'); xrv.models.ResNet(weights='resnet50-res512-all'); xrv.baseline_models.chestx_det.PSPNet(); xrv.autoencoders.ResNetAE(weights='101-elastic'); url = next(a['params']['weights_url'] for a in yaml.safe_load(open('analyzers.yaml'))['analyzers'] if 'weights_url' in a.get('params', {})); urllib.request.urlretrieve(url, pathlib.Path(xrv.utils.get_cache_dir()) / url.rsplit('/', 1)[1])"

# Migrations run at startup, so the image needs them next to the app.
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

# Fail the build early if any registered analyzer cannot load (no downloads happen here).
RUN python -c "import torch; from app.config import get_settings; from app.analyzers.registry import AnalyzerRegistry; AnalyzerRegistry.from_yaml(get_settings().registry_path).load(torch.device('cpu'))"

EXPOSE 8000
# Client IPs and the scheme come from the nginx proxy's X-Forwarded-* headers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]

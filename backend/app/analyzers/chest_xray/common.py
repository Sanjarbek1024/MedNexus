"""Shared helpers for the torchxrayvision-based analyzers."""

import hashlib
import logging
import shutil
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import torch
import torchxrayvision as xrv

logger = logging.getLogger(__name__)

# Not exposed by torchxrayvision; same URL as xrv.baseline_models.chestx_det.PSPNet.
PSPNET_URL = (
    "https://github.com/mlmed/torchxrayvision/releases/download/v1/"
    "pspnet_chestxray_best_model_4.pth"
)


def ensure_weights(url: str) -> Path:
    """Place a weight file in torchxrayvision's cache before the model is constructed.

    Downloads to a temporary name first, so an interrupted download never leaves a corrupt
    file where torchxrayvision would trust it (its own downloader writes in place).
    """
    target = Path(xrv.utils.get_cache_dir()) / Path(urlparse(url).path).name
    if target.is_file():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    logger.info("Downloading %s", url)
    with urllib.request.urlopen(url, timeout=60) as response, partial.open("wb") as out:
        shutil.copyfileobj(response, out, length=1 << 20)
    partial.replace(target)
    return target


def fingerprint(path: Path) -> str:
    """Short content hash of a weight file, recorded in the audit log."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:12]


def to_batch(square: np.ndarray, device: torch.device) -> torch.Tensor:
    """(1, S, S) numpy input → (1, 1, S, S) float tensor on ``device``."""
    return torch.from_numpy(square).unsqueeze(0).to(device)

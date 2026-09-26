"""Model weight files: safe downloads and provenance fingerprints."""

import hashlib
import logging
import shutil
import urllib.request
from functools import cache
from pathlib import Path
from urllib.parse import urlparse

import torchxrayvision as xrv

from app.config import get_settings

logger = logging.getLogger(__name__)


def _project_cache_dir() -> str:
    return str(get_settings().weights_dir) + "/"


# torchxrayvision keeps weights in ~/.torchxrayvision; point it (and our own downloads) at the
# project's weights folder instead, so a copied or deployed folder needs no other files.
xrv.utils.get_cache_dir = _project_cache_dir


def ensure_weights(url: str, filename: str | None = None) -> Path:
    """Place a weight file in the project's weights folder (WEIGHTS_DIR, default backend/weights).

    ``filename`` names the cached file when the URL ends in a generic name (for example a
    Hugging Face ``model.safetensors``). Downloads to a temporary name first, so an interrupted
    download never leaves a corrupt file where a loader would trust it.
    """
    target = Path(xrv.utils.get_cache_dir()) / (filename or Path(urlparse(url).path).name)
    if target.is_file():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    logger.info("Downloading %s", url)
    with urllib.request.urlopen(url, timeout=60) as response, partial.open("wb") as out:
        shutil.copyfileobj(response, out, length=1 << 20)
    partial.replace(target)
    return target


@cache
def fingerprint(path: Path) -> str:
    """Short content hash of a weight file, recorded in the audit log."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:12]

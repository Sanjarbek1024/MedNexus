"""Model weight files: safe downloads and provenance fingerprints."""

import hashlib
import logging
import shutil
import urllib.request
from functools import cache
from pathlib import Path
from urllib.parse import urlparse

import torchxrayvision as xrv

logger = logging.getLogger(__name__)


def ensure_weights(url: str) -> Path:
    """Place a weight file in the model cache (torchxrayvision's cache directory).

    Downloads to a temporary name first, so an interrupted download never leaves a corrupt
    file where a loader would trust it.
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


@cache
def fingerprint(path: Path) -> str:
    """Short content hash of a weight file, recorded in the audit log."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:12]

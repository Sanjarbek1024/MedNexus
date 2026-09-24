"""Shared helpers for the torchxrayvision-based analyzers."""

from functools import cache

import numpy as np
import torch
import torchxrayvision as xrv
from scipy import ndimage

from app.analyzers.weights import ensure_weights, fingerprint
from app.imaging import StudyImage

# Not exposed by torchxrayvision; same URL as xrv.baseline_models.chestx_det.PSPNet.
PSPNET_URL = (
    "https://github.com/mlmed/torchxrayvision/releases/download/v1/"
    "pspnet_chestxray_best_model_4.pth"
)
PSPNET_SIZE = 512
# PSPNet target name -> display label
STRUCTURES = {"Right Lung": "Right lung", "Left Lung": "Left lung", "Heart": "Heart"}


def to_batch(square: np.ndarray, device: torch.device) -> torch.Tensor:
    """(1, S, S) numpy input → (1, 1, S, S) float tensor on ``device``."""
    return torch.from_numpy(square).unsqueeze(0).to(device)


@cache
def load_pspnet(device: torch.device) -> tuple[torch.nn.Module, str]:
    """The ChestX-Det PSPNet, loaded once per device and shared by every analyzer that needs it."""
    path = ensure_weights(PSPNET_URL)
    return xrv.baseline_models.chestx_det.PSPNet().to(device).eval(), fingerprint(path)


def segment(model: torch.nn.Module, image: StudyImage, device: torch.device) -> dict[str, np.ndarray]:
    """Display label -> boolean mask (PSPNET_SIZE², covering ``image.square_box``)."""
    channels = [model.targets.index(name) for name in STRUCTURES]
    x = to_batch(image.square(PSPNET_SIZE), device)
    with torch.inference_mode():
        logits = model(x)[0, channels]
    probabilities = torch.sigmoid(logits).cpu().numpy()
    return {
        label: _largest_component(ndimage.gaussian_filter(p, sigma=2) > 0.5)
        for label, p in zip(STRUCTURES.values(), probabilities)
    }


def area_fractions(masks: dict[str, np.ndarray]) -> tuple[float, float, float]:
    """(right lung, left lung, heart) as fractions of the analyzed square."""
    area = PSPNET_SIZE * PSPNET_SIZE
    return tuple(float(masks[label].sum()) / area for label in STRUCTURES.values())  # type: ignore[return-value]


def _largest_component(mask: np.ndarray) -> np.ndarray:
    labels, count = ndimage.label(mask)
    if count == 0:
        return mask
    sizes = ndimage.sum(mask, labels, index=range(1, count + 1))
    return ndimage.binary_fill_holes(labels == int(np.argmax(sizes)) + 1)

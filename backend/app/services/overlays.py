"""Encodes images and overlays for the browser."""

import base64
import io

import numpy as np
from PIL import Image
from skimage import measure

from app.imaging import StudyImage

DISPLAY_MAX_SIDE = 2048
HEATMAP_SIDE = 256

# Heatmap colour ramp: (position, r, g, b, alpha). Low activations stay transparent.
_RAMP = np.array(
    [
        (0.00, 250, 204, 21, 0.0),
        (0.35, 250, 204, 21, 0.25),
        (0.65, 249, 115, 22, 0.60),
        (1.00, 220, 38, 38, 0.85),
    ]
)


def _data_url(image: Image.Image, fmt: str, **options: object) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **options)
    mime = "image/jpeg" if fmt == "JPEG" else "image/png"
    return f"data:{mime};base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"


def grayscale_jpeg(image: StudyImage, max_side: int = DISPLAY_MAX_SIDE, quality: int = 92) -> str:
    """The study as an 8-bit grayscale JPEG, at most ``max_side`` px on its long side."""
    pixels = np.clip(image.unit() * 255, 0, 255).astype(np.uint8)
    picture = Image.fromarray(pixels)
    picture.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return _data_url(picture, "JPEG", quality=quality)


def heatmap(values: np.ndarray) -> str:
    """Grad-CAM map in [0, 1] → semi-transparent RGBA PNG."""
    small = np.asarray(
        Image.fromarray(values.astype(np.float32)).resize(
            (HEATMAP_SIDE, HEATMAP_SIDE), Image.Resampling.BILINEAR
        )
    ).clip(0, 1)
    channels = [np.interp(small, _RAMP[:, 0], _RAMP[:, i]) for i in range(1, 5)]
    channels[3] = channels[3] * 255
    rgba = np.stack(channels, axis=-1).round().astype(np.uint8)
    return _data_url(Image.fromarray(rgba), "PNG", optimize=True)


def contour_path(mask: np.ndarray, tolerance: float = 1.0) -> str:
    """SVG path outlining a boolean mask, in mask pixel coordinates."""
    padded = np.pad(mask.astype(np.float32), 1)
    commands = []
    for contour in measure.find_contours(padded, 0.5):
        if len(contour) < 12:
            continue
        points = measure.approximate_polygon(contour, tolerance) - 1  # undo padding
        commands.append(
            "M" + " L".join(f"{x:.1f},{y:.1f}" for y, x in points) + " Z"
        )
    return " ".join(commands)

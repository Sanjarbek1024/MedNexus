"""Decoding of uploaded studies (DICOM, PNG, JPEG) into one normalized grayscale image."""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass, field
from pathlib import PurePath

import numpy as np
import pydicom
import torchxrayvision as xrv
from PIL import Image, ImageOps

# torchxrayvision models expect pixels scaled to [-XRV_RANGE, XRV_RANGE].
XRV_RANGE = 1024.0

DICOM_SUFFIXES = {".dcm", ".dicom"}


class ImageDecodeError(ValueError):
    """The upload is not a readable DICOM, PNG or JPEG image."""


@dataclass(frozen=True)
class DicomHeader:
    """Non-identifying acquisition attributes, used only for consistency checks."""

    modality: str | None
    body_part: str | None
    view_position: str | None


@dataclass(frozen=True)
class Box:
    """Axis-aligned box in original-image coordinates, normalized to [0, 1]."""

    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True, eq=False)
class StudyImage:
    pixels: np.ndarray  # float32 (H, W) on the torchxrayvision scale [-1024, 1024]
    colorfulness: float  # Hasler–Süsstrunk colorfulness of the original; 0 for grayscale
    format: str  # "dicom" | "png" | "jpeg"
    sha256: str
    dicom: DicomHeader | None = None
    _squares: dict[int, np.ndarray] = field(default_factory=dict, init=False, repr=False)

    @property
    def height(self) -> int:
        return int(self.pixels.shape[0])

    @property
    def width(self) -> int:
        return int(self.pixels.shape[1])

    def unit(self) -> np.ndarray:
        """Pixels rescaled to [0, 1]."""
        return (self.pixels + XRV_RANGE) / (2 * XRV_RANGE)

    @property
    def square_box(self) -> Box:
        """The central square that ``square()`` covers (same arithmetic as XRayCenterCrop)."""
        size = min(self.height, self.width)
        x0 = self.width // 2 - size // 2
        y0 = self.height // 2 - size // 2
        return Box(x0 / self.width, y0 / self.height, size / self.width, size / self.height)

    def square(self, size: int) -> np.ndarray:
        """(1, size, size) model input: torchxrayvision's reference center crop and resize.

        Cached per size, because several analyzers share the same input resolution.
        """
        if size not in self._squares:
            cropped = xrv.datasets.XRayCenterCrop()(self.pixels[None, ...])
            self._squares[size] = xrv.datasets.XRayResizer(size)(cropped)
        return self._squares[size]


def decode_upload(data: bytes, filename: str | None = None) -> StudyImage:
    digest = hashlib.sha256(data).hexdigest()
    suffix = PurePath(filename or "").suffix.lower()
    if data[128:132] == b"DICM" or suffix in DICOM_SUFFIXES:
        return _decode_dicom(data, digest)
    return _decode_raster(data, digest)


def _decode_dicom(data: bytes, digest: str) -> StudyImage:
    try:
        dataset = pydicom.dcmread(io.BytesIO(data), stop_before_pixels=True, force=True)
        pixels = _read_dicom_pixels(data)
    except NotImplementedError as exc:  # colour photometric interpretations
        raise ImageDecodeError(f"Unsupported DICOM image: {exc}") from exc
    except Exception as exc:
        raise ImageDecodeError("Could not read the DICOM pixel data.") from exc

    if pixels.ndim == 3:  # multi-frame: analyze the first frame
        pixels = pixels[0]
    header = DicomHeader(
        modality=_dicom_text(dataset, "Modality"),
        body_part=_dicom_text(dataset, "BodyPartExamined"),
        view_position=_dicom_text(dataset, "ViewPosition"),
    )
    return StudyImage(pixels.astype(np.float32), 0.0, "dicom", digest, header)


def _read_dicom_pixels(data: bytes) -> np.ndarray:
    # torchxrayvision's reference DICOM reader. The VOI LUT is applied so the models see the same
    # windowed image as the physician (training images were exported the same way); if the
    # windowed values overflow the stored bit depth we fall back to the raw stored values.
    try:
        return xrv.utils.read_xray_dcm(io.BytesIO(data), voi_lut=True)
    except ValueError:
        return xrv.utils.read_xray_dcm(io.BytesIO(data), voi_lut=False)


def _dicom_text(dataset: pydicom.Dataset, keyword: str) -> str | None:
    value = str(dataset.get(keyword, "") or "").strip().upper()
    return value or None


def _decode_raster(data: bytes, digest: str) -> StudyImage:
    try:
        with Image.open(io.BytesIO(data)) as opened:
            image_format = (opened.format or "").lower()
            if image_format not in {"png", "jpeg"}:
                raise ImageDecodeError("Unsupported file type. Upload a DICOM, PNG or JPEG image.")
            image = ImageOps.exif_transpose(opened)
            gray, colorfulness, max_value = _to_grayscale(image)
    except ImageDecodeError:
        raise
    except Exception as exc:  # corrupt data, decompression bombs, exotic modes
        raise ImageDecodeError("Could not decode the image file.") from exc

    pixels = xrv.utils.normalize(gray, max_value)
    return StudyImage(pixels.astype(np.float32), colorfulness, image_format, digest)


def _to_grayscale(image: Image.Image) -> tuple[np.ndarray, float, int]:
    """Return (grayscale array, colorfulness, max representable value)."""
    if image.mode in {"I", "I;16", "I;16B", "I;16L"}:
        array = np.asarray(image).astype(np.float32)
        return array, 0.0, _bit_depth_max(int(array.max()))
    if image.mode in {"L", "LA", "1"}:
        return np.asarray(image.convert("L")).astype(np.float32), 0.0, 255

    rgb = np.asarray(image.convert("RGB")).astype(np.float32)
    # Channel mean, as in the torchxrayvision reference preprocessing.
    return rgb.mean(axis=2), _colorfulness(rgb), 255


def _bit_depth_max(max_value: int) -> int:
    """Largest value of the smallest common medical bit depth that holds ``max_value``."""
    for bits in (8, 10, 12, 14, 16):
        if max_value <= 2**bits - 1:
            return 2**bits - 1
    raise ImageDecodeError("Unsupported bit depth (more than 16 bits per pixel).")


def _colorfulness(rgb: np.ndarray) -> float:
    """Hasler & Süsstrunk (2003) colorfulness; ~0 for grayscale, >40 for vivid photos."""
    sample = rgb[::4, ::4]
    rg = sample[..., 0] - sample[..., 1]
    yb = 0.5 * (sample[..., 0] + sample[..., 1]) - sample[..., 2]
    return float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))

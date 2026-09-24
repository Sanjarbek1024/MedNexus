import numpy as np

from app.analyzers.base import AnalysisContext, CheckStatus
from app.analyzers.quality import ImageQualityGate
from app.imaging import XRV_RANGE, StudyImage

CONTEXT = AnalysisContext("xray", "chest", "PA", lambda stage: None)
GATE = ImageQualityGate("quality", [])


def study(unit: np.ndarray, colorfulness: float = 0.0) -> StudyImage:
    pixels = (unit.astype(np.float32) * 2 - 1) * XRV_RANGE
    return StudyImage(pixels, colorfulness, "png", "0" * 64)


def statuses(image: StudyImage) -> dict[str, CheckStatus]:
    return {check.id: check.status for check in GATE.analyze(image, CONTEXT).checks}


def radiograph_like(size: int = 1024) -> np.ndarray:
    rng = np.random.default_rng(0)
    gradient = np.linspace(0.1, 0.9, size)[None, :].repeat(size, axis=0)
    return np.clip(gradient + rng.normal(0, 0.05, (size, size)), 0, 1)


def test_plausible_radiograph_passes() -> None:
    result = GATE.analyze(study(radiograph_like()), CONTEXT)
    assert not result.rejected
    assert all(check.status is CheckStatus.PASS for check in result.checks)


def test_blank_image_is_rejected() -> None:
    result = GATE.analyze(study(np.full((1024, 1024), 0.5)), CONTEXT)
    assert result.rejected
    assert statuses(study(np.full((1024, 1024), 0.5)))["signal"] is CheckStatus.FAIL


def test_tiny_image_is_rejected() -> None:
    assert statuses(study(radiograph_like(128)))["resolution"] is CheckStatus.FAIL


def test_color_photo_is_rejected() -> None:
    result = GATE.analyze(study(radiograph_like(), colorfulness=45.0), CONTEXT)
    assert result.rejected
    grayscale = next(c for c in result.checks if c.id == "grayscale")
    assert "photograph" in grayscale.detail
    assert grayscale.code == "grayscale_fail" and grayscale.params == {"score": 45}

"""Rule-based image quality gate for radiographs."""

from collections.abc import Sequence

import numpy as np

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    CheckCategory,
    CheckStatus,
    SafetyCheck,
    Scope,
    Stage,
)
from app.imaging import StudyImage

Q = CheckCategory.QUALITY


class ImageQualityGate(Analyzer):
    """Resolution, colour, signal, contrast, exposure and field-of-view checks."""

    label = "Image quality gate"
    stage = Stage.QUALITY

    def __init__(
        self,
        analyzer_id: str,
        scopes: Sequence[Scope],
        *,
        min_side_px: int = 256,
        recommended_side_px: int = 512,
        max_colorfulness: float = 20.0,
        warn_colorfulness: float = 8.0,
        min_std: float = 0.02,
        min_dynamic_range: float = 0.15,
        warn_dynamic_range: float = 0.30,
        exposure_limits: tuple[float, float] = (0.08, 0.92),
        max_cropped_fraction: float = 0.25,
    ) -> None:
        super().__init__(analyzer_id, scopes)
        self.min_side_px = min_side_px
        self.recommended_side_px = recommended_side_px
        self.max_colorfulness = max_colorfulness
        self.warn_colorfulness = warn_colorfulness
        self.min_std = min_std
        self.min_dynamic_range = min_dynamic_range
        self.warn_dynamic_range = warn_dynamic_range
        self.exposure_limits = exposure_limits
        self.max_cropped_fraction = max_cropped_fraction

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        unit = image.unit()[::2, ::2]  # statistics are stable at half resolution
        return AnalyzerResult(
            self.id,
            checks=[
                self._resolution(image),
                self._grayscale(image),
                self._signal(unit),
                self._contrast(unit),
                self._exposure(unit),
                self._field_of_view(image),
            ],
        )

    def _resolution(self, image: StudyImage) -> SafetyCheck:
        side = min(image.width, image.height)
        size = f"{image.width} × {image.height} px"
        if side < self.min_side_px:
            return SafetyCheck(
                "resolution", Q, "Resolution", CheckStatus.FAIL,
                f"{size} is below the {self.min_side_px} px minimum.", blocking=True,
            )
        if side < self.recommended_side_px:
            return SafetyCheck(
                "resolution", Q, "Resolution", CheckStatus.WARN,
                f"{size} is below the recommended {self.recommended_side_px} px; "
                "fine detail may be lost.",
            )
        return SafetyCheck("resolution", Q, "Resolution", CheckStatus.PASS, size)

    def _grayscale(self, image: StudyImage) -> SafetyCheck:
        score = image.colorfulness
        if score > self.max_colorfulness:
            return SafetyCheck(
                "grayscale", Q, "Grayscale", CheckStatus.FAIL,
                f"Color image detected (colorfulness {score:.0f}); radiographs are grayscale. "
                "This looks like a photograph, not an X-ray.", blocking=True,
            )
        if score > self.warn_colorfulness:
            return SafetyCheck(
                "grayscale", Q, "Grayscale", CheckStatus.WARN,
                f"Slight color tint (colorfulness {score:.0f}); was the X-ray photographed?",
            )
        return SafetyCheck("grayscale", Q, "Grayscale", CheckStatus.PASS, "Grayscale image.")

    def _signal(self, unit: np.ndarray) -> SafetyCheck:
        std = float(unit.std())
        if std < self.min_std:
            return SafetyCheck(
                "signal", Q, "Signal", CheckStatus.FAIL,
                "The image is blank or nearly uniform.", blocking=True,
            )
        return SafetyCheck("signal", Q, "Signal", CheckStatus.PASS, "Image content present.")

    def _contrast(self, unit: np.ndarray) -> SafetyCheck:
        low, high = np.percentile(unit, [1, 99])
        spread = float(high - low)
        detail = f"Dynamic range {spread:.2f} (1st–99th percentile)."
        if spread < self.min_dynamic_range:
            return SafetyCheck(
                "contrast", Q, "Contrast", CheckStatus.FAIL,
                f"Very low contrast. {detail}", blocking=True,
            )
        if spread < self.warn_dynamic_range:
            return SafetyCheck("contrast", Q, "Contrast", CheckStatus.WARN, f"Low contrast. {detail}")
        return SafetyCheck("contrast", Q, "Contrast", CheckStatus.PASS, detail)

    def _exposure(self, unit: np.ndarray) -> SafetyCheck:
        mean = float(unit.mean())
        dark, bright = self.exposure_limits
        if mean < dark or mean > bright:
            tone = "dark" if mean < dark else "bright"
            return SafetyCheck(
                "exposure", Q, "Exposure", CheckStatus.WARN,
                f"The image is very {tone} (mean intensity {mean:.2f}).",
            )
        return SafetyCheck(
            "exposure", Q, "Exposure", CheckStatus.PASS, f"Mean intensity {mean:.2f}."
        )

    def _field_of_view(self, image: StudyImage) -> SafetyCheck:
        box = image.square_box
        cropped = 1.0 - box.width * box.height
        if cropped > self.max_cropped_fraction:
            return SafetyCheck(
                "field_of_view", Q, "Field of view", CheckStatus.WARN,
                f"The models analyze the central square only; {cropped:.0%} of the image "
                "(its edges) is outside the analyzed region.",
            )
        return SafetyCheck(
            "field_of_view", Q, "Field of view", CheckStatus.PASS,
            f"The analyzed central square covers {1 - cropped:.0%} of the image.",
        )

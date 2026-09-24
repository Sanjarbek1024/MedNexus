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
    """Resolution, colour, signal, contrast and exposure checks."""

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
            ],
        )

    def _resolution(self, image: StudyImage) -> SafetyCheck:
        side = min(image.width, image.height)
        size = f"{image.width} × {image.height} px"
        params = {"width": image.width, "height": image.height}
        if side < self.min_side_px:
            return SafetyCheck(
                "resolution", Q, "Resolution", CheckStatus.FAIL,
                f"{size} is below the {self.min_side_px} px minimum.", blocking=True,
                code="resolution_fail", params=params | {"limit": self.min_side_px},
            )
        if side < self.recommended_side_px:
            return SafetyCheck(
                "resolution", Q, "Resolution", CheckStatus.WARN,
                f"{size} is below the recommended {self.recommended_side_px} px; fine detail may be lost.",
                code="resolution_warn", params=params | {"limit": self.recommended_side_px},
            )
        return SafetyCheck("resolution", Q, "Resolution", CheckStatus.PASS, size, code="resolution_ok", params=params)

    def _grayscale(self, image: StudyImage) -> SafetyCheck:
        score = round(image.colorfulness)
        if image.colorfulness > self.max_colorfulness:
            return SafetyCheck(
                "grayscale", Q, "Grayscale", CheckStatus.FAIL,
                f"Color image detected (colorfulness {score}); radiographs are grayscale. "
                "This looks like a photograph, not an X-ray.", blocking=True,
                code="grayscale_fail", params={"score": score},
            )
        if image.colorfulness > self.warn_colorfulness:
            return SafetyCheck(
                "grayscale", Q, "Grayscale", CheckStatus.WARN,
                f"Slight color tint (colorfulness {score}); was the X-ray photographed?",
                code="grayscale_warn", params={"score": score},
            )
        return SafetyCheck("grayscale", Q, "Grayscale", CheckStatus.PASS, "Grayscale image.", code="grayscale_ok")

    def _signal(self, unit: np.ndarray) -> SafetyCheck:
        if float(unit.std()) < self.min_std:
            return SafetyCheck(
                "signal", Q, "Signal", CheckStatus.FAIL, "The image is blank or nearly uniform.",
                blocking=True, code="signal_fail",
            )
        return SafetyCheck("signal", Q, "Signal", CheckStatus.PASS, "Image content present.", code="signal_ok")

    def _contrast(self, unit: np.ndarray) -> SafetyCheck:
        low, high = np.percentile(unit, [1, 99])
        spread = round(float(high - low), 2)
        detail = f"Dynamic range {spread:.2f} (1st–99th percentile)."
        params = {"range": spread}
        if spread < self.min_dynamic_range:
            return SafetyCheck(
                "contrast", Q, "Contrast", CheckStatus.FAIL, f"Very low contrast. {detail}",
                blocking=True, code="contrast_fail", params=params,
            )
        if spread < self.warn_dynamic_range:
            return SafetyCheck(
                "contrast", Q, "Contrast", CheckStatus.WARN, f"Low contrast. {detail}",
                code="contrast_warn", params=params,
            )
        return SafetyCheck("contrast", Q, "Contrast", CheckStatus.PASS, detail, code="contrast_ok", params=params)

    def _exposure(self, unit: np.ndarray) -> SafetyCheck:
        mean = round(float(unit.mean()), 2)
        dark, bright = self.exposure_limits
        if mean < dark or mean > bright:
            tone = "dark" if mean < dark else "bright"
            return SafetyCheck(
                "exposure", Q, "Exposure", CheckStatus.WARN,
                f"The image is very {tone} (mean intensity {mean:.2f}).",
                code=f"exposure_{tone}", params={"mean": mean},
            )
        return SafetyCheck(
            "exposure", Q, "Exposure", CheckStatus.PASS, f"Mean intensity {mean:.2f}.",
            code="exposure_ok", params={"mean": mean},
        )

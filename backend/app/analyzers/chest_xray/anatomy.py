"""Chest anatomy segmentation: lung and heart masks, anatomy checks and the CTR estimate."""

from collections.abc import Sequence

import numpy as np
import torch

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    CheckCategory,
    CheckStatus,
    Mask,
    Measurement,
    SafetyCheck,
    Scope,
    Stage,
)
from app.analyzers.chest_xray.common import area_fractions, load_pspnet, segment
from app.imaging import StudyImage

CTR_REFERENCE = 0.5
D = CheckCategory.DISTRIBUTION


class ChestAnatomySegmenter(Analyzer):
    """ChestX-Det PSPNet segmentation of both lungs and the heart.

    Runs as a gate: if the lung fields cannot be found, the image is not treated as a
    frontal chest radiograph. It also estimates the cardiothoracic ratio (CTR) from the masks.
    """

    label = "Anatomy segmentation (PSPNet)"
    stage = Stage.QUALITY

    def __init__(
        self,
        analyzer_id: str,
        scopes: Sequence[Scope],
        *,
        min_lung_fraction: float,
        min_heart_fraction: float,
        max_cropped_fraction: float = 0.25,
    ) -> None:
        super().__init__(analyzer_id, scopes)
        self.min_lung_fraction = min_lung_fraction
        self.min_heart_fraction = min_heart_fraction
        self.max_cropped_fraction = max_cropped_fraction
        self._versions: dict[str, str] = {}

    def load(self, device: torch.device) -> None:
        self.device = device
        self.model, version = load_pspnet(device)
        self._versions = {"chestx-det-pspnet": version}

    @property
    def versions(self) -> dict[str, str]:
        return self._versions

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        masks = segment(self.model, image, self.device)
        right, left, heart = area_fractions(masks)
        box = image.square_box
        result = AnalyzerResult(
            self.id,
            checks=[self._field_of_view(image)],
            masks=[Mask(label, mask, box) for label, mask in masks.items() if mask.any()],
            metadata={"area_fraction": {"right_lung": right, "left_lung": left, "heart": heart}},
        )
        if min(right, left) < self.min_lung_fraction:
            result.checks.append(SafetyCheck(
                "anatomy", D, "Chest anatomy", CheckStatus.FAIL,
                "The lung fields could not be identified; this does not look like a frontal "
                "chest radiograph.", blocking=True, code="anatomy_fail",
            ))
            return result
        if heart < self.min_heart_fraction:
            result.checks.append(SafetyCheck(
                "anatomy", D, "Chest anatomy", CheckStatus.WARN,
                "Lung fields found, but the heart outline could not be identified.", code="anatomy_heart_warn",
            ))
            return result
        result.checks.append(SafetyCheck(
            "anatomy", D, "Chest anatomy", CheckStatus.PASS,
            "Both lung fields and the heart outline were identified.", code="anatomy_ok",
        ))
        result.measurements.append(_cardiothoracic_ratio(masks, context.view))
        return result

    def _field_of_view(self, image: StudyImage) -> SafetyCheck:
        """The chest models read the central square only; say how much of the image that leaves out."""
        box = image.square_box
        cropped = 1.0 - box.width * box.height
        percent = round(100 * cropped)
        if cropped > self.max_cropped_fraction:
            return SafetyCheck(
                "field_of_view", CheckCategory.QUALITY, "Field of view", CheckStatus.WARN,
                f"The models analyze the central square only; {percent}% of the image "
                "(its edges) is outside the analyzed region.",
                code="fov_warn", params={"percent": percent},
            )
        return SafetyCheck(
            "field_of_view", CheckCategory.QUALITY, "Field of view", CheckStatus.PASS,
            f"The analyzed central square covers {100 - percent}% of the image.",
            code="fov_ok", params={"percent": 100 - percent},
        )


def _horizontal_extent(mask: np.ndarray) -> int:
    columns = np.flatnonzero(mask.any(axis=0))
    return int(columns[-1] - columns[0] + 1)


def _cardiothoracic_ratio(masks: dict[str, np.ndarray], view: str) -> Measurement:
    thorax = _horizontal_extent(masks["Right lung"] | masks["Left lung"])
    ratio = _horizontal_extent(masks["Heart"]) / thorax
    detail = (
        "Estimated from the AI segmentation: widest heart diameter over widest distance "
        "between the outer lung borders. Verify on the image."
    )
    if view == "AP":
        detail += " AP projection magnifies the heart, so the ratio is overestimated."
    return Measurement("ctr", "Cardiothoracic ratio", round(ratio, 3), CTR_REFERENCE, detail)

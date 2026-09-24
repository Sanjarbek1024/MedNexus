"""Chest anatomy segmentation: lung and heart masks, an anatomy check and the CTR estimate."""

from collections.abc import Sequence

import numpy as np
import torch
import torchxrayvision as xrv
from scipy import ndimage

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
from app.analyzers.chest_xray.common import PSPNET_URL, ensure_weights, fingerprint, to_batch
from app.imaging import StudyImage

# PSPNet target name -> display label
STRUCTURES = {"Right Lung": "Right lung", "Left Lung": "Left lung", "Heart": "Heart"}
INPUT_SIZE = 512
CTR_REFERENCE = 0.5


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
    ) -> None:
        super().__init__(analyzer_id, scopes)
        self.min_lung_fraction = min_lung_fraction
        self.min_heart_fraction = min_heart_fraction
        self._versions: dict[str, str] = {}

    def load(self, device: torch.device) -> None:
        path = ensure_weights(PSPNET_URL)
        self.device = device
        self.model = xrv.baseline_models.chestx_det.PSPNet().to(device).eval()
        self._channels = [self.model.targets.index(name) for name in STRUCTURES]
        self._versions = {"chestx-det-pspnet": fingerprint(path)}

    @property
    def versions(self) -> dict[str, str]:
        return self._versions

    def segment(self, image: StudyImage) -> dict[str, np.ndarray]:
        """Display label -> boolean mask (INPUT_SIZE², covering ``image.square_box``)."""
        x = to_batch(image.square(INPUT_SIZE), self.device)
        with torch.inference_mode():
            logits = self.model(x)[0, self._channels]
        probabilities = torch.sigmoid(logits).cpu().numpy()
        return {
            label: _largest_component(ndimage.gaussian_filter(p, sigma=2) > 0.5)
            for label, p in zip(STRUCTURES.values(), probabilities)
        }

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        masks = self.segment(image)
        area = INPUT_SIZE * INPUT_SIZE
        right, left, heart = (float(masks[label].sum()) / area for label in STRUCTURES.values())
        box = image.square_box

        result = AnalyzerResult(
            self.id,
            masks=[Mask(label, mask, box) for label, mask in masks.items() if mask.any()],
            metadata={"area_fraction": {"right_lung": right, "left_lung": left, "heart": heart}},
        )
        lungs_found = min(right, left) >= self.min_lung_fraction
        if not lungs_found:
            result.checks.append(SafetyCheck(
                "anatomy", CheckCategory.DISTRIBUTION, "Chest anatomy", CheckStatus.FAIL,
                "The lung fields could not be identified; this does not look like a frontal "
                "chest radiograph.", blocking=True,
            ))
            return result

        if heart < self.min_heart_fraction:
            result.checks.append(SafetyCheck(
                "anatomy", CheckCategory.DISTRIBUTION, "Chest anatomy", CheckStatus.WARN,
                "Lung fields found, but the heart outline could not be identified.",
            ))
            return result

        result.checks.append(SafetyCheck(
            "anatomy", CheckCategory.DISTRIBUTION, "Chest anatomy", CheckStatus.PASS,
            "Both lung fields and the heart outline were identified.",
        ))
        result.measurements.append(_cardiothoracic_ratio(masks, context.view))
        return result


def _largest_component(mask: np.ndarray) -> np.ndarray:
    labels, count = ndimage.label(mask)
    if count == 0:
        return mask
    sizes = ndimage.sum(mask, labels, index=range(1, count + 1))
    return ndimage.binary_fill_holes(labels == int(np.argmax(sizes)) + 1)


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

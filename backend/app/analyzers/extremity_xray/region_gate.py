"""Body-region gate: refuses chest radiographs submitted as extremity studies."""

from collections.abc import Sequence

import torch

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
from app.analyzers.chest_xray.common import area_fractions, load_pspnet, segment
from app.imaging import StudyImage


class NotChestGate(Analyzer):
    """Uses the chest anatomy model the other way round: if it finds both lung fields, the
    image is a chest radiograph, and an extremity model must not read it."""

    label = "Body-region gate (anatomy)"
    stage = Stage.QUALITY

    def __init__(self, analyzer_id: str, scopes: Sequence[Scope], *, max_lung_fraction: float) -> None:
        super().__init__(analyzer_id, scopes)
        self.max_lung_fraction = max_lung_fraction
        self._versions: dict[str, str] = {}

    def load(self, device: torch.device) -> None:
        self.device = device
        self.model, version = load_pspnet(device)
        self._versions = {"chestx-det-pspnet": version}

    @property
    def versions(self) -> dict[str, str]:
        return self._versions

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        right, left, _ = area_fractions(segment(self.model, image, self.device))
        if min(right, left) >= self.max_lung_fraction:
            check = SafetyCheck(
                "body_region", CheckCategory.DISTRIBUTION, "Body region", CheckStatus.FAIL,
                "Both lung fields are visible: this looks like a chest radiograph. Select Chest, "
                "or upload an image of the extremity.", blocking=True, code="not_chest_fail",
            )
        else:
            check = SafetyCheck(
                "body_region", CheckCategory.DISTRIBUTION, "Body region", CheckStatus.PASS,
                "No lung fields found; consistent with an extremity radiograph.", code="not_chest_ok",
            )
        return AnalyzerResult(self.id, checks=[check])

"""Analyzer plugin interface.

An analyzer is one self-contained model or rule set. It receives a decoded study image and
returns structured evidence: safety checks, findings with scores, heatmaps, anatomy masks and
measurements. Analyzers are declared in ``analyzers.yaml``; the pipeline runs every analyzer
that supports the selected (modality, region, view) and stops as soon as a blocking safety
check fails. A vision-language model plugs in the same way: it returns findings (and
optionally heatmaps or masks) from ``analyze``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, ClassVar

import numpy as np
import torch

from app.imaging import Box, StudyImage


class Stage(StrEnum):
    """Pipeline stages, in execution order. They drive the progress indicator."""

    CLINICAL = "clinical"  # clinical rules engine (always first)
    QUALITY = "quality"
    MODELS = "models"
    EXPLAINABILITY = "explainability"
    REPORT = "report"


class CheckCategory(StrEnum):
    QUALITY = "quality"
    DISTRIBUTION = "distribution"
    AGREEMENT = "agreement"
    METADATA = "metadata"
    REPORT = "report"


class CheckStatus(StrEnum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"


class Level(StrEnum):
    """Confidence level of a reported finding, derived from configurable score thresholds."""

    HIGH = "high"
    MODERATE = "moderate"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class Scope:
    """Studies an analyzer applies to. ``None`` matches anything."""

    modality: str | None = None
    region: str | None = None
    views: frozenset[str] | None = None

    def matches(self, modality: str, region: str, view: str) -> bool:
        return (
            (self.modality is None or self.modality == modality)
            and (self.region is None or self.region == region)
            and (self.views is None or view in self.views)
        )


@dataclass(frozen=True)
class SafetyCheck:
    id: str
    category: CheckCategory
    label: str
    status: CheckStatus
    detail: str  # English text for the API, the audit log and the LLM
    blocking: bool = False  # a failed blocking check rejects the image
    code: str | None = None  # message key the UI translates, with ``params``
    params: Mapping[str, str | float | int] = field(default_factory=dict)

    @property
    def rejects(self) -> bool:
        return self.blocking and self.status is CheckStatus.FAIL


@dataclass(frozen=True)
class Detection:
    box: Box
    score: float


@dataclass(frozen=True)
class Finding:
    name: str
    score: float  # model score in [0, 1]; a model output, not a calibrated probability
    level: Level
    model_scores: Mapping[str, float]
    models_agree: bool
    boxes: tuple[Detection, ...] = ()  # localized detections, for detector models


@dataclass(frozen=True)
class Heatmap:
    finding: str
    values: np.ndarray  # float32 in [0, 1], covering `box`
    box: Box


@dataclass(frozen=True)
class Mask:
    label: str
    values: np.ndarray  # bool, covering `box`
    box: Box


@dataclass(frozen=True)
class Measurement:
    id: str
    label: str
    value: float
    reference: float | None  # conventional cut-off, shown for context
    detail: str


@dataclass
class AnalyzerResult:
    analyzer: str
    checks: list[SafetyCheck] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    scores: dict[str, float] = field(default_factory=dict)  # every scored label, reported or not
    raw_scores: dict[str, dict[str, float]] = field(default_factory=dict)  # per model, for audit
    heatmaps: list[Heatmap] = field(default_factory=list)
    masks: list[Mask] = field(default_factory=list)
    measurements: list[Measurement] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def rejected(self) -> bool:
        return any(check.rejects for check in self.checks)


@dataclass(frozen=True)
class AnalysisContext:
    modality: str
    region: str
    view: str
    progress: Callable[[Stage], None]


class Analyzer(ABC):
    """Base class for analyzer plugins.

    Subclasses take their ``params`` from ``analyzers.yaml`` as keyword arguments.
    """

    label: ClassVar[str]
    stage: ClassVar[Stage] = Stage.MODELS
    provides_findings: ClassVar[bool] = False

    def __init__(self, analyzer_id: str, scopes: Sequence[Scope]) -> None:
        self.id = analyzer_id
        self.scopes = tuple(scopes)

    def supports(self, modality: str, region: str, view: str) -> bool:
        return any(scope.matches(modality, region, view) for scope in self.scopes)

    def load(self, device: torch.device) -> None:
        """Load weights once at startup. Rule-based analyzers need nothing."""

    @property
    def versions(self) -> dict[str, str]:
        """Model and weight identifiers recorded in the audit log."""
        return {}

    @abstractmethod
    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        """Analyze one study image."""

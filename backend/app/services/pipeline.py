"""Runs the registered analyzers for one study, gates first."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from app.analyzers.base import AnalysisContext, AnalyzerResult, Stage
from app.analyzers.registry import AnalyzerRegistry
from app.imaging import StudyImage

ProgressFn = Callable[[Stage], None]


class UnsupportedStudyError(ValueError):
    """No findings-producing analyzer supports the selected study type."""


@dataclass
class PipelineOutcome:
    results: list[AnalyzerResult] = field(default_factory=list)
    versions: dict[str, dict[str, str]] = field(default_factory=dict)
    timings_ms: dict[str, int] = field(default_factory=dict)

    @property
    def rejected(self) -> bool:
        return any(result.rejected for result in self.results)

    def collect(self, attribute: str) -> list:
        return [item for result in self.results for item in getattr(result, attribute)]


class AnalysisPipeline:
    def __init__(self, registry: AnalyzerRegistry) -> None:
        self.registry = registry
        # Analyses share model instances and Grad-CAM hooks, and saturate the CPU anyway.
        self._lock = threading.Lock()

    def run(
        self, image: StudyImage, modality: str, region: str, view: str, progress: ProgressFn
    ) -> PipelineOutcome:
        if not self.registry.is_supported(modality, region, view):
            raise UnsupportedStudyError(f"{modality}/{region}/{view} is not supported yet")

        context = AnalysisContext(modality, region, view, progress)
        outcome = PipelineOutcome()
        with self._lock:
            for analyzer in self.registry.pipeline(modality, region, view):
                progress(analyzer.stage)
                started = time.perf_counter()
                outcome.results.append(analyzer.analyze(image, context))
                outcome.timings_ms[analyzer.id] = round((time.perf_counter() - started) * 1000)
                if analyzer.versions:
                    outcome.versions[analyzer.id] = analyzer.versions
                if outcome.rejected:
                    break
        return outcome

"""Lightweight analyzers for testing the registry without loading model weights."""

from collections.abc import Sequence

from app.analyzers.base import Analyzer, AnalysisContext, AnalyzerResult, Scope, Stage
from app.imaging import StudyImage


class FakeGate(Analyzer):
    label = "Fake gate"
    stage = Stage.QUALITY

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        return AnalyzerResult(self.id)


class FakeClassifier(Analyzer):
    label = "Fake classifier"
    provides_findings = True

    def __init__(self, analyzer_id: str, scopes: Sequence[Scope], *, threshold: float = 0.5):
        super().__init__(analyzer_id, scopes)
        self.threshold = threshold

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        return AnalyzerResult(self.id)

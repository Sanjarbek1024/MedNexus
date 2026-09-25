"""Study types without a specialist model: only the vision-language assessment runs.

This analyzer produces no findings of its own. It makes the study type available and records,
as a visible warning, that the only reading is the general vision-language model's, which is
experimental and has not been validated for this study type.
"""

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    CheckCategory,
    CheckStatus,
    SafetyCheck,
)
from app.imaging import StudyImage


class VisionLanguageOnly(Analyzer):
    label = "Vision-language assessment only (experimental)"
    provides_findings = True  # the differential comes from the multimodal assessment

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        return AnalyzerResult(self.id, checks=[SafetyCheck(
            "vision_only", CheckCategory.DISTRIBUTION, "Specialist model", CheckStatus.WARN,
            "No specialist model covers this study type yet. Only the general vision-language "
            "assessment is available; treat it as experimental.",
            code="vision_only",
        )])

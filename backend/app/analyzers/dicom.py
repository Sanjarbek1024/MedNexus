"""Checks the DICOM header against the study type the physician selected."""

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    CheckCategory,
    CheckStatus,
    SafetyCheck,
    Stage,
)
from app.imaging import StudyImage

MODALITIES = {"CR": "xray", "DX": "xray", "DR": "xray", "CT": "ct", "MR": "mri"}
BODY_PARTS = {
    "CHEST": "chest", "THORAX": "chest", "LUNG": "chest",
    "HEAD": "head", "SKULL": "head", "BRAIN": "head",
    "ABDOMEN": "abdomen", "PELVIS": "abdomen",
    "SPINE": "spine", "CSPINE": "spine", "TSPINE": "spine", "LSPINE": "spine",
    "HAND": "extremity", "WRIST": "extremity", "ELBOW": "extremity", "ARM": "extremity",
    "SHOULDER": "extremity", "HIP": "extremity", "KNEE": "extremity", "LEG": "extremity",
    "ANKLE": "extremity", "FOOT": "extremity", "EXTREMITY": "extremity",
}
VIEWS = {"PA": "PA", "AP": "AP", "LL": "Lateral", "RL": "Lateral", "LAT": "Lateral",
         "LATERAL": "Lateral"}

M = CheckCategory.METADATA


class DicomConsistencyGate(Analyzer):
    """Compares Modality, BodyPartExamined and ViewPosition with the selection.

    A modality mismatch rejects the study; region and view mismatches are warnings because
    those header fields are often filled in loosely.
    """

    label = "DICOM header consistency"
    stage = Stage.QUALITY

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        header = image.dicom
        if header is None:
            return AnalyzerResult(self.id)

        checks = []
        modality = MODALITIES.get(header.modality or "")
        if modality and modality != context.modality:
            checks.append(SafetyCheck(
                "dicom_modality", M, "DICOM modality", CheckStatus.FAIL,
                f"The DICOM header says {header.modality}, which does not match the selected "
                "modality.", blocking=True, code="dicom_modality_fail", params={"value": header.modality},
            ))
        region = BODY_PARTS.get(header.body_part or "")
        if region and region != context.region:
            checks.append(SafetyCheck(
                "dicom_region", M, "DICOM body part", CheckStatus.WARN,
                f"The DICOM header says {header.body_part}; please confirm the selected region.",
                code="dicom_region_warn", params={"value": header.body_part},
            ))
        view = VIEWS.get(header.view_position or "")
        if view and view != context.view:
            checks.append(SafetyCheck(
                "dicom_view", M, "DICOM view", CheckStatus.WARN,
                f"The DICOM header says {view} but {context.view} was selected. "
                "Findings and measurements depend on the projection.",
                code="dicom_view_warn", params={"value": view, "selected": context.view},
            ))
        if not checks:
            fields = [v for v in (header.modality, header.body_part, header.view_position) if v]
            detail = (
                f"Consistent with the selection ({' · '.join(fields)})."
                if fields
                else "The header has no modality, body part or view to compare."
            )
            checks.append(SafetyCheck(
                "dicom_header", M, "DICOM header", CheckStatus.PASS, detail,
                code="dicom_ok" if fields else "dicom_empty", params={"fields": " · ".join(fields)},
            ))
        return AnalyzerResult(self.id, checks=checks)

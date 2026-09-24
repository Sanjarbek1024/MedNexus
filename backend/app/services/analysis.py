"""Use cases: analyze a study, regenerate its report, record the physician's review."""

from __future__ import annotations

import time
from dataclasses import asdict

from app.analyzers.base import CheckCategory, CheckStatus, Stage
from app.db.models import utcnow
from app.db.store import CaseStore
from app.imaging import Box, StudyImage
from app.schemas import (
    AnalysisResult,
    BoxOut,
    CaseStatus,
    CheckOut,
    FindingOut,
    HeatmapOut,
    ImageOut,
    MeasurementOut,
    Review,
    ReviewAction,
    ReviewRequest,
    ScoreOut,
    Selection,
    StructureOut,
)
from app.services import overlays
from app.services.pipeline import AnalysisPipeline, PipelineOutcome, ProgressFn
from app.services.reporting import ReportWriter

REVIEW_STATUS = {
    ReviewAction.CONFIRM: CaseStatus.CONFIRMED,
    ReviewAction.REJECT: CaseStatus.REJECTED,
    ReviewAction.EDIT: CaseStatus.EDITED,
}


class ReviewNotAllowedError(ValueError):
    pass


def _box(box: Box) -> BoxOut:
    return BoxOut(**asdict(box))


def build_result(image: StudyImage, selection: Selection, outcome: PipelineOutcome) -> AnalysisResult:
    checks = [CheckOut(**asdict(check)) for check in outcome.collect("checks")]
    image_out = ImageOut(
        url=overlays.grayscale_jpeg(image),
        width=image.width,
        height=image.height,
        format=image.format,
        sha256=image.sha256,
    )
    common = dict(
        created_at=utcnow(),
        selection=selection,
        image=image_out,
        checks=checks,
        versions=outcome.versions,
        timings_ms=dict(outcome.timings_ms),
    )
    if outcome.rejected:
        return AnalysisResult(
            **common,
            status=CaseStatus.IMAGE_REJECTED,
            rejected=True,
            rejection_reasons=[c.detail for c in checks if c.blocking and c.status == CheckStatus.FAIL],
            findings=[], other_scores=[], not_assessed=[], thresholds={}, structures=[],
            measurements=[],
        )

    heatmaps = {h.finding: h for h in outcome.collect("heatmaps")}
    findings = [
        FindingOut(
            name=f.name,
            score=round(f.score, 4),
            level=f.level,
            model_scores={k: round(v, 4) for k, v in f.model_scores.items()},
            models_agree=f.models_agree,
            heatmap=(
                HeatmapOut(url=overlays.heatmap(heatmaps[f.name].values), box=_box(heatmaps[f.name].box))
                if f.name in heatmaps
                else None
            ),
        )
        for f in outcome.collect("findings")
    ]
    reported = {f.name for f in findings}
    scores = {name: s for result in outcome.results for name, s in result.scores.items()}
    metadata = [result.metadata for result in outcome.results]
    return AnalysisResult(
        **common,
        status=CaseStatus.DRAFT,
        rejected=False,
        rejection_reasons=[],
        findings=findings,
        other_scores=sorted(
            (ScoreOut(name=n, score=round(s, 4)) for n, s in scores.items() if n not in reported),
            key=lambda item: item.score,
            reverse=True,
        ),
        not_assessed=[label for m in metadata for label in m.get("not_assessed", [])],
        thresholds=next((m["thresholds"] for m in metadata if "thresholds" in m), {}),
        structures=[
            StructureOut(
                label=mask.label,
                path=overlays.contour_path(mask.values),
                size=mask.values.shape[0],
                box=_box(mask.box),
            )
            for mask in outcome.collect("masks")
        ],
        measurements=[MeasurementOut(**asdict(m)) for m in outcome.collect("measurements")],
    )


class AnalysisService:
    def __init__(self, pipeline: AnalysisPipeline, writer: ReportWriter, store: CaseStore) -> None:
        self.pipeline = pipeline
        self.writer = writer
        self.store = store

    def supports(self, modality: str, region: str, view: str) -> bool:
        return self.pipeline.registry.is_supported(modality, region, view)

    def analyze(self, image: StudyImage, selection: Selection, progress: ProgressFn) -> AnalysisResult:
        outcome = self.pipeline.run(
            image, selection.modality, selection.region, selection.view, progress
        )
        result = build_result(image, selection, outcome)
        if not result.rejected:
            progress(Stage.REPORT)
            self._write_report(result, selection.language)

        raw_scores = {k: v for r in outcome.results for k, v in r.raw_scores.items()}
        case_id = self.store.create(result, overlays.grayscale_jpeg(image, 160, 80), raw_scores)
        self.store.log(case_id, "analysis_created", "system", {
            "image_sha256": image.sha256,
            "selection": selection.model_dump(),
            "status": result.status,
            "model_versions": result.versions,
            "raw_scores": raw_scores,
            "rejection_reasons": result.rejection_reasons,
        })
        if result.report or result.report_error:
            self._log_report(result)
        return self.store.load(case_id)

    def regenerate_report(self, case_id: int, language: str) -> AnalysisResult:
        result = self.store.load(case_id)
        if result.rejected:
            raise ReviewNotAllowedError("rejected images have no findings to report on")
        result.selection.language = language
        self._write_report(result, language)
        self.store.save(result)
        self._log_report(result)
        return self.store.load(case_id)

    def review(self, case_id: int, request: ReviewRequest) -> AnalysisResult:
        result = self.store.load(case_id)
        if result.rejected:
            raise ReviewNotAllowedError("the image was rejected by a safety gate")
        result.review = Review(
            action=request.action,
            reviewer=request.reviewer.strip(),
            notes=request.notes.strip(),
            final_impression=(request.final_impression or "").strip() or None,
            reviewed_at=utcnow(),
        )
        result.status = REVIEW_STATUS[request.action]
        self.store.save(result)
        self.store.log(case_id, f"review_{request.action}", result.review.reviewer, {
            "status": result.status,
            "notes": result.review.notes,
            "final_impression": result.review.final_impression,
        })
        return self.store.load(case_id)

    def _write_report(self, result: AnalysisResult, language: str) -> None:
        started = time.perf_counter()
        outcome = self.writer.write(result, language)
        result.timings_ms["report"] = round((time.perf_counter() - started) * 1000)
        result.report, result.report_error = outcome.report, outcome.error
        for finding in result.findings:
            finding.explanation = outcome.explanations.get(finding.name)

        result.checks = [c for c in result.checks if c.category != CheckCategory.REPORT]
        if outcome.report is None:
            status = CheckStatus.WARN
            detail = f"AI report unavailable: {outcome.error}. Model outputs are shown without narrative."
        elif outcome.report.removed_findings:
            status = CheckStatus.WARN
            detail = (
                "Removed from the AI report because the image models did not produce them: "
                + ", ".join(outcome.report.removed_findings) + "."
            )
        else:
            status = CheckStatus.PASS
            detail = "Every finding in the AI report comes from the image models."
        result.checks.append(CheckOut(
            id="report_grounding", category=CheckCategory.REPORT, label="Report grounding",
            status=status, detail=detail, blocking=False,
        ))

    def _log_report(self, result: AnalysisResult) -> None:
        assert result.case_id is not None
        self.store.log(result.case_id, "report_generated", "system", {
            "language": result.selection.language,
            "model": self.writer.model,
            "report": result.report.model_dump() if result.report else None,
            "error": result.report_error,
        })

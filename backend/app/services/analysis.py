"""Use cases: register an upload, analyze it, regenerate its report, record the physician's review."""

from __future__ import annotations

import logging
import time
from dataclasses import asdict
from datetime import datetime

from sqlmodel import Session

from app.analyzers.base import CheckStatus, Stage
from app.config import Settings
from app.db import audit
from app.db.models import CLINICAL, Analysis, Case, CaseStatus, Patient, Priority, Report, Review, User, utcnow
from app.db.session import get_engine
from app.imaging import Box, StudyImage, decode_upload
from app.schemas import (
    AnalysisResult,
    ClinicalData,
    BoxOut,
    CheckOut,
    DetectionOut,
    FindingOut,
    HeatmapOut,
    ImageOut,
    MeasurementOut,
    ReportSections,
    ReviewAction,
    ReviewRequest,
    ScoreOut,
    Selection,
    StructureOut,
)
from app.services import overlays, uploads
from app.services.assessment import (
    AssessmentUnavailableError,
    PatientContext,
    assess_clinical,
    assess_with_pipeline,
)
from app.services.clinical_rules import evaluate, higher, rules_reason
from app.services.cases import assemble, candidate_labels, latest
from app.services.llm import LLM
from app.services.pipeline import AnalysisPipeline, PipelineOutcome, ProgressFn
from app.services.reporting import ReportWriter
from app.services.triage import prioritize

logger = logging.getLogger(__name__)


class ReviewNotAllowedError(ValueError):
    pass


def _box(box: Box) -> BoxOut:
    return BoxOut(**asdict(box))


def build_result(image: StudyImage, selection: Selection, outcome: PipelineOutcome) -> AnalysisResult:
    checks = [CheckOut(**asdict(check)) for check in outcome.collect("checks")]
    common = dict(
        created_at=utcnow(),
        status=CaseStatus.AI_READY,
        selection=selection,
        image=ImageOut(
            url=overlays.grayscale_jpeg(image), width=image.width, height=image.height,
            format=image.format, sha256=image.sha256,
        ),
        checks=checks,
        versions=outcome.versions,
        timings_ms=dict(outcome.timings_ms),
    )
    if outcome.rejected:
        return AnalysisResult(
            **common | {"status": CaseStatus.IMAGE_REJECTED},
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
            boxes=[DetectionOut(**asdict(d.box), score=round(d.score, 4)) for d in f.boxes],
        )
        for f in outcome.collect("findings")
    ]
    reported = {f.name for f in findings}
    scores = {name: s for result in outcome.results for name, s in result.scores.items()}
    metadata = [result.metadata for result in outcome.results]
    return AnalysisResult(
        **common,
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
    def __init__(
        self, pipeline: AnalysisPipeline, writer: ReportWriter, settings: Settings, vision: LLM | None = None
    ) -> None:
        self.pipeline = pipeline
        self.writer = writer
        self.settings = settings
        self.vision = vision

    @property
    def registry(self):  # noqa: ANN201
        return self.pipeline.registry

    def supports(self, modality: str, region: str, view: str) -> bool:
        return self.registry.is_supported(modality, region, view)

    # --- Intake ---------------------------------------------------------------------------------

    def create_case(
        self,
        session: Session,
        user: User,
        upload: uploads.SanitizedUpload,
        image: StudyImage,
        selection: Selection,
        patient: Patient,
        acquired_at: datetime | None,
        context: PatientContext | None = None,
    ) -> Case:
        case = Case(
            owner_id=user.id,
            patient_id=patient.id,
            status=CaseStatus.QUEUED,
            modality=selection.modality,
            region=selection.region,
            view=selection.view,
            language=selection.language,
            image_sha256=upload.sha256,
            image_format=upload.original_format,
            upload_path=uploads.store(self.settings.uploads_dir, upload),
            thumbnail=overlays.grayscale_jpeg(image, 160, 80),
            acquired_at=acquired_at or utcnow(),
            symptoms=context.symptoms if context else None,
            patient_age=context.age if context else None,
            patient_sex=context.sex if context else None,
            clinical=context.clinical if context else None,
        )
        session.add(case)
        session.commit()
        session.refresh(case)
        audit.record(
            session, "case_uploaded", user.full_name,
            {
                "image_sha256": upload.sha256,
                "format": upload.original_format,
                "anonymized": upload.stored_format == "dicom",
                "patient": patient.pseudonym,
                "selection": selection.model_dump(),
            },
            user_id=user.id, case_id=case.id,
        )
        return case

    def create_clinical_case(
        self, session: Session, user: User, patient: Patient, language: str, context: PatientContext
    ) -> Case:
        """A case built from the clinical intake alone; imaging can be attached later."""
        case = Case(
            owner_id=user.id, patient_id=patient.id, status=CaseStatus.QUEUED,
            modality=CLINICAL, region="none", view="none", language=language,
            image_sha256="", image_format="", upload_path="", thumbnail=None,
            symptoms=context.symptoms, patient_age=context.age, patient_sex=context.sex,
            clinical=context.clinical,
        )
        session.add(case)
        session.commit()
        session.refresh(case)
        audit.record(session, "case_created", user.full_name, {
            "patient": patient.pseudonym, "mode": "clinical", "intake": context.clinical or {},
        }, user_id=user.id, case_id=case.id)
        return case

    def attach_image(
        self, session: Session, case: Case, user: User, upload: uploads.SanitizedUpload, image: StudyImage,
        selection: Selection,
    ) -> Case:
        """Add imaging to an existing clinical case; the differential is rebuilt with the image."""
        if case.modality != CLINICAL:
            raise ReviewNotAllowedError("this case already has an image")
        if case.status == CaseStatus.REVIEWED:
            raise ReviewNotAllowedError("the case is signed")
        case.modality, case.region, case.view = selection.modality, selection.region, selection.view
        case.image_sha256, case.image_format = upload.sha256, upload.original_format
        case.upload_path = uploads.store(self.settings.uploads_dir, upload)
        case.thumbnail = overlays.grayscale_jpeg(image, 160, 80)
        case.status = CaseStatus.QUEUED
        session.add(case)
        session.commit()
        audit.record(session, "imaging_attached", user.full_name, {
            "image_sha256": upload.sha256, "format": upload.original_format, "selection": selection.model_dump(),
        }, user_id=user.id, case_id=case.id)
        return case

    @staticmethod
    def context(case: Case) -> PatientContext:
        data = ClinicalData.model_validate(case.clinical) if case.clinical else None
        rules = evaluate(data, case.patient_age) if data else None
        return PatientContext(
            case.symptoms, case.patient_age, case.patient_sex,
            clinical=data.model_dump() if data else None,
            rules=rules.model_dump(mode="json") if rules else None,
        )

    # --- Analysis ------------------------------------------------------------------------------

    def run(self, case_id: int, progress: ProgressFn) -> None:
        """Analyze a stored upload. Safe to call from a background thread."""
        with Session(get_engine()) as session:
            case = session.get(Case, case_id)
            if case is None:
                return
            case.status = CaseStatus.ANALYZING
            session.add(case)
            session.commit()
            try:
                if case.modality == CLINICAL:
                    self._analyze_clinical(session, case, progress)
                else:
                    self._analyze(session, case, progress)
            except Exception:
                logger.exception("Analysis of case %s failed", case_id)
                session.rollback()
                case = session.get(Case, case_id)
                case.status = CaseStatus.FAILED
                case.error = "The analysis failed unexpectedly."
                session.add(case)
                session.commit()
                audit.record(session, "analysis_failed", "system", {}, case_id=case_id)

    def _analyze_clinical(self, session: Session, case: Case, progress: ProgressFn) -> None:
        """No image: rules engine → clinical reasoner → safety critic → guardrails."""
        progress(Stage.CLINICAL)
        context = self.context(case)
        rules = evaluate(ClinicalData.model_validate(case.clinical) if case.clinical else None, case.patient_age)
        case.priority, case.priority_reason = rules.priority, rules_reason(rules)
        case.analyzed_at = utcnow()
        case.status = CaseStatus.AI_READY
        session.add(case)
        session.commit()
        audit.record(session, "rules_evaluated", "system", rules.model_dump(mode="json"), case_id=case.id)
        progress(Stage.REPORT)
        self._write_assessment(session, case, None, None, case.language, context)

    def _analyze(self, session: Session, case: Case, progress: ProgressFn) -> None:
        progress(Stage.CLINICAL)
        context = self.context(case)
        data = (self.settings.uploads_dir / case.upload_path).read_bytes()
        image = decode_upload(data, case.image_sha256)
        selection = Selection(modality=case.modality, region=case.region, view=case.view, language=case.language)
        outcome = self.pipeline.run(image, case.modality, case.region, case.view, progress)
        result = build_result(image, selection, outcome)
        result.image.format = case.image_format
        raw_scores = {k: v for r in outcome.results for k, v in r.raw_scores.items()}
        session.add(Analysis(
            case_id=case.id,
            model_versions=result.versions,
            raw_scores=raw_scores,
            summary={
                "findings": [
                    {"name": f.name, "level": f.level, "agree": f.models_agree} for f in result.findings
                ],
                "rejected_by": [c.id for c in result.checks if c.blocking and c.status == CheckStatus.FAIL],
            },
            result=result.model_dump(mode="json", exclude={"report", "review", "audit", "physician_report"}),
        ))

        case.analyzed_at = utcnow()
        case.finding_count = len(result.findings)
        case.headline = result.findings[0].name if result.findings else None
        if result.rejected:
            case.status, case.priority, case.priority_reason = CaseStatus.IMAGE_REJECTED, Priority.ROUTINE, None
        else:
            case.status = CaseStatus.AI_READY
            case.priority, case.priority_reason = prioritize(result.findings, self.registry.urgent_findings)
            if context.rules:
                rules_priority = context.rules["priority"]
                if higher(rules_priority, case.priority) != case.priority:
                    case.priority = rules_priority
                    case.priority_reason = rules_reason(evaluate(ClinicalData.model_validate(case.clinical), case.patient_age))
        session.add(case)
        session.commit()
        audit.record(session, "analysis_created", "system", {
            "status": case.status,
            "priority": case.priority,
            "model_versions": result.versions,
            "raw_scores": raw_scores,
            "rejection_reasons": result.rejection_reasons,
        }, case_id=case.id)

        if not result.rejected:
            progress(Stage.REPORT)
            self._write_report(session, case, result, case.language)
            self._write_assessment(session, case, result, image, case.language, context)

    def _write_assessment(
        self, session: Session, case: Case, result: AnalysisResult | None, image: StudyImage | None, language: str,
        context: PatientContext | None = None,
    ) -> None:
        """The differential (with or without an image), stored as a report of kind "assessment"."""
        reasoner = self.writer.llm
        if image is not None and self.vision is None:
            return
        context = context or self.context(case)
        started = time.perf_counter()
        assessment, error = None, None
        audience = "doctor"
        model_name = reasoner.model if image is None else self.vision.model
        try:
            if image is None or result is None:
                assessment = assess_clinical(reasoner, context, language)
            else:
                assessment = assess_with_pipeline(
                    self.vision, result, overlays.grayscale_jpeg(image, 768, 85), context, language, reasoner=reasoner,
                )
        except AssessmentUnavailableError as exc:
            error = str(exc)
        except Exception as exc:  # noqa: BLE001 - any LLM or format failure leaves the case usable
            logger.warning("Assessment of case %s failed: %s", case.id, exc)
            error = "The assessment is unavailable right now. Please try again."
        if assessment and assessment.differential and case.modality == CLINICAL:
            case.headline = assessment.differential[0].name[:120]
            case.finding_count = len(assessment.differential)
            session.add(case)
        session.add(Report(
            case_id=case.id,
            kind="assessment",
            language=language,
            model=assessment.model if assessment else model_name,
            error=error,
            content={
                **(assessment.model_dump() if assessment else {}),
                "duration_ms": round((time.perf_counter() - started) * 1000),
            },
        ))
        session.commit()
        audit.record(session, "assessment_generated", "system", {
            "language": language,
            "model": assessment.model if assessment else model_name,
            "audience": audience,
            "pipeline": [step.model_dump() for step in assessment.pipeline] if assessment else None,
            "differential": [d.model_dump() for d in assessment.differential] if assessment else None,
            "error": error,
        }, case_id=case.id)

    def regenerate_assessment(self, session: Session, case: Case, language: str) -> None:
        if case.status not in (CaseStatus.AI_READY, CaseStatus.REVIEWED):
            raise ReviewNotAllowedError("only analyzed cases have an assessment")
        if case.modality == CLINICAL:
            self._write_assessment(session, case, None, None, language)
            return
        image = decode_upload((self.settings.uploads_dir / case.upload_path).read_bytes(), case.image_sha256)
        self._write_assessment(session, case, assemble(session, case, with_audit=False), image, language)

    def _write_report(self, session: Session, case: Case, result: AnalysisResult, language: str) -> None:
        started = time.perf_counter()
        outcome = self.writer.write(result, language)
        report = outcome.report
        session.add(Report(
            case_id=case.id,
            kind="ai",
            language=language,
            model=self.writer.model,
            error=outcome.error,
            content={
                **(report.model_dump(include={"summary", "next_steps", "limitations", "removed_findings"}) if report else {}),
                "explanations": outcome.explanations,
                "local_names": outcome.local_names,
                "duration_ms": round((time.perf_counter() - started) * 1000),
            },
        ))
        case.language = language
        session.add(case)
        session.commit()
        audit.record(session, "report_generated", "system", {
            "language": language,
            "model": self.writer.model,
            "report": report.model_dump() if report else None,
            "error": outcome.error,
        }, case_id=case.id)

    def regenerate_report(self, session: Session, case: Case, language: str) -> None:
        if case.status not in (CaseStatus.AI_READY, CaseStatus.REVIEWED) or case.modality == CLINICAL:
            raise ReviewNotAllowedError("only analyzed images with findings have a report")
        self._write_report(session, case, assemble(session, case, with_audit=False), language)

    # --- Physician report ----------------------------------------------------------------------

    def save_draft(self, session: Session, case: Case, sections: ReportSections, user: User) -> None:
        if case.status not in (CaseStatus.AI_READY, CaseStatus.REVIEWED):
            raise ReviewNotAllowedError("this case has nothing to report on")
        report = latest(session, Report, case.id, kind="physician")
        if report is not None and report.status == "final":
            raise ReviewNotAllowedError("the report is signed; submit a new review to amend it")
        if report is None:
            report = Report(case_id=case.id, kind="physician", language=case.language, content={})
        report.content = sections.model_dump()
        report.author_id = user.id
        report.updated_at = utcnow()
        session.add(report)
        session.commit()

    def review(self, session: Session, case: Case, request: ReviewRequest, user: User) -> None:
        if case.status not in (CaseStatus.AI_READY, CaseStatus.REVIEWED):
            raise ReviewNotAllowedError(
                "the image was rejected by a safety gate" if case.status == CaseStatus.IMAGE_REJECTED
                else "the case has not been analyzed yet"
            )
        result = assemble(session, case, with_audit=False)
        ai_names = [f.name for f in result.findings]
        unknown = set(request.finding_decisions) - set(ai_names)
        if unknown:
            raise ReviewNotAllowedError(f"unknown findings: {', '.join(sorted(unknown))}")
        not_candidates = set(request.added_findings) - set(candidate_labels(result)) - set(result.not_assessed)
        if not_candidates:
            raise ReviewNotAllowedError(f"cannot add findings: {', '.join(sorted(not_candidates))}")

        default = "disagree" if request.action is ReviewAction.REJECT else "agree"
        decisions = {name: request.finding_decisions.get(name, default) for name in ai_names}
        existing = latest(session, Report, case.id, kind="physician")
        sections = request.report or (
            ReportSections(**{k: existing.content.get(k, "") for k in ("findings", "impression", "recommendations")})
            if existing else result.suggested_report or ReportSections()
        )
        if request.final_impression and request.final_impression.strip():
            sections.impression = request.final_impression.strip()

        now = utcnow()
        report = existing or Report(case_id=case.id, kind="physician", language=case.language, content={})
        report.content = sections.model_dump()
        report.author_id = user.id
        report.status = "final"
        report.updated_at = now
        report.signed_at = now
        session.add(report)
        session.add(Review(
            case_id=case.id, reviewer_id=user.id, action=request.action, notes=request.notes.strip(),
            finding_decisions=decisions, added_findings=sorted(set(request.added_findings)),
        ))
        amended = case.status == CaseStatus.REVIEWED
        case.status = CaseStatus.REVIEWED
        case.reviewed_at = now
        session.add(case)
        session.commit()
        audit.record(session, f"review_{request.action}", user.full_name, {
            "amendment": amended,
            "notes": request.notes.strip(),
            "finding_decisions": decisions,
            "added_findings": sorted(set(request.added_findings)),
            "report": sections.model_dump(),
        }, user_id=user.id, case_id=case.id)

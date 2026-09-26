"""Case access control and assembly of the full case view from the stored records."""

from __future__ import annotations

from sqlalchemy import or_
from sqlmodel import Session, col, func, select

from app.analyzers.base import CheckCategory, CheckStatus
from app.db.audit import as_utc
from app.db.models import (
    CLINICAL,
    Analysis,
    AuditEvent,
    Case,
    CaseStatus,
    Patient,
    Report,
    Review,
    User,
)
from app.schemas import (
    AnalysisResult,
    AuditEventOut,
    CaseSummary,
    CheckOut,
    ClinicalData,
    ImageOut,
    PatientRef,
    PhysicianReport,
    ReportSections,
    Review as ReviewOut,
    ReviewAction,
    Selection,
)
from app.schemas import Assessment
from app.schemas import Report as AIReport
from app.services.clinical_rules import evaluate
from app.services.hospitals import recommend, specialty_for


class CaseNotFoundError(LookupError):
    pass


def visible(statement, user: User):  # noqa: ANN001, ANN201
    """Restrict a Case query to what ``user`` may see: their own cases."""
    return statement.where(Case.owner_id == user.id)


def get_case(session: Session, case_id: int, user: User) -> Case:
    case = session.get(Case, case_id)
    if case is None or case.owner_id != user.id:
        raise CaseNotFoundError(case_id)  # same answer for "missing" and "not yours"
    return case


def latest(session: Session, model, case_id: int, **filters):  # noqa: ANN001, ANN201
    statement = select(model).where(model.case_id == case_id)
    for key, value in filters.items():
        statement = statement.where(getattr(model, key) == value)
    return session.exec(statement.order_by(col(model.id).desc()).limit(1)).first()


def user_names(session: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = session.exec(select(User.id, User.full_name).where(col(User.id).in_(ids))).all()
    return dict(rows)


def summaries(session: Session, cases: list[Case]) -> list[CaseSummary]:
    patients = {
        p.id: p for p in session.exec(
            select(Patient).where(col(Patient.id).in_({c.patient_id for c in cases}))
        ).all()
    } if cases else {}
    reviews = {}
    for case in cases:
        if case.status == CaseStatus.REVIEWED:
            reviews[case.id] = latest(session, Review, case.id)
    names = user_names(
        session, {c.owner_id for c in cases} | {r.reviewer_id for r in reviews.values() if r}
    )
    urgency: dict[int, str] = {}  # latest assessment per case; later rows overwrite earlier ones
    if cases:
        for report in session.exec(
            select(Report)
            .where(Report.kind == "assessment", col(Report.case_id).in_([c.id for c in cases]))
            .order_by(Report.id)
        ).all():
            urgency[report.case_id] = None if report.error else report.content.get("urgency")
    return [
        CaseSummary(
            id=c.id,
            created_at=as_utc(c.created_at),
            acquired_at=as_utc(c.acquired_at),
            status=c.status,
            priority=c.priority,
            priority_reason=c.priority_reason,
            modality=c.modality,
            region=c.region,
            view=c.view,
            headline=c.headline,
            finding_count=c.finding_count,
            thumbnail=c.thumbnail,
            patient=PatientRef(id=c.patient_id, pseudonym=patients[c.patient_id].pseudonym),
            owner=names.get(c.owner_id, ""),
            reviewer=names.get(reviews[c.id].reviewer_id) if reviews.get(c.id) else None,
            reviewed_at=as_utc(c.reviewed_at) if c.reviewed_at else None,
            urgency=urgency.get(c.id),
            error=c.error,
            has_image=c.modality != CLINICAL,
            chief_complaint=(c.clinical or {}).get("chief_complaint") or None,
        )
        for c in cases
    ]


def search_filter(statement, query: str):  # noqa: ANN001, ANN201
    term = f"%{query.strip().lower()}%"
    conditions = [
        func.lower(Patient.pseudonym).like(term),
        func.lower(Case.headline).like(term),
        func.lower(Case.priority_reason).like(term),
    ]
    digits = query.strip().lstrip("#").lstrip("0")
    if digits.isdigit():
        conditions.append(Case.id == int(digits))
    return statement.join(Patient, Patient.id == Case.patient_id).where(or_(*conditions))


def suggested_sections(result: AnalysisResult, local_names: dict[str, str]) -> ReportSections:
    """Structured report pre-filled from the AI draft, for the physician to edit."""
    lines = []
    for finding in result.findings:
        name = local_names.get(finding.name, finding.name)
        detail = finding.explanation or f"AI score {finding.score:.2f} ({finding.level})"
        lines.append(f"• {name}: {detail}")
    lines += [f"• {m.label}: {m.value:.2f}" for m in result.measurements]
    report = result.report
    return ReportSections(
        findings="\n".join(lines),
        impression=report.summary if report else "",
        recommendations="\n".join(f"• {step}" for step in report.next_steps) if report else "",
    )


def _grounding_check(report: AIReport | None, error: str | None) -> CheckOut:
    if report is None:
        status, code = CheckStatus.WARN, "report_unavailable"
        detail = f"AI report unavailable: {error}. Model outputs are shown without narrative."
    elif report.removed_findings:
        status, code = CheckStatus.WARN, "report_removed"
        detail = (
            "Removed from the AI report because the image models did not produce them: "
            + ", ".join(report.removed_findings) + "."
        )
    else:
        status, code = CheckStatus.PASS, "report_grounded"
        detail = "Every finding in the AI report comes from the image models."
    return CheckOut(
        id="report_grounding", category=CheckCategory.REPORT, label="Report grounding",
        status=status, detail=detail, blocking=False, code=code,
        params={"items": ", ".join(report.removed_findings) if report else "", "error": error or ""},
    )


def _placeholder(case: Case) -> AnalysisResult:
    """A case that has not been analyzed (yet): only the thumbnail is available."""
    return AnalysisResult(
        created_at=as_utc(case.created_at),
        status=case.status,
        selection=Selection(modality=case.modality, region=case.region, view=case.view, language=case.language),
        image=ImageOut(url=case.thumbnail or "", width=0, height=0, format=case.image_format, sha256=case.image_sha256),
        rejected=False, rejection_reasons=[], checks=[], findings=[], other_scores=[], not_assessed=[],
        thresholds={}, structures=[], measurements=[], versions={}, timings_ms={},
    )


def assemble(session: Session, case: Case, with_audit: bool = True) -> AnalysisResult:
    analysis = latest(session, Analysis, case.id)
    result = AnalysisResult.model_validate(analysis.result) if analysis else _placeholder(case)
    patient = session.get(Patient, case.patient_id)
    ai_report = latest(session, Report, case.id, kind="ai")
    physician = latest(session, Report, case.id, kind="physician")
    review = latest(session, Review, case.id)
    names = user_names(
        session,
        {case.owner_id}
        | ({physician.author_id} if physician and physician.author_id else set())
        | ({review.reviewer_id} if review else set()),
    )

    result.case_id = case.id
    result.status = case.status
    result.priority = case.priority
    result.priority_reason = case.priority_reason
    result.patient = PatientRef(id=patient.id, pseudonym=patient.pseudonym)
    result.owner = names.get(case.owner_id)
    result.acquired_at = as_utc(case.acquired_at)
    result.created_at = as_utc(case.created_at)
    result.selection.language = case.language
    result.symptoms = case.symptoms
    result.patient_age = case.patient_age
    result.patient_sex = case.patient_sex if case.patient_sex in ("male", "female") else None
    result.has_image = case.modality != CLINICAL
    if case.clinical:
        result.clinical = ClinicalData.model_validate(case.clinical)
        result.rules = evaluate(result.clinical, case.patient_age)
    assessment = latest(session, Report, case.id, kind="assessment")
    if assessment is not None:
        result.assessment = (
            Assessment.model_validate({k: v for k, v in assessment.content.items() if k != "duration_ms"})
            if not assessment.error else None
        )
        result.assessment_error = assessment.error
    if result.assessment is not None:
        result.hospitals = recommend(result.assessment.specialty, result.assessment.urgency)
    elif not result.rejected:
        result.hospitals = recommend(specialty_for([f.name for f in result.findings]))

    local_names: dict[str, str] = {}
    if ai_report is not None:
        content = ai_report.content
        result.report = AIReport(
            language=ai_report.language, model=ai_report.model or "", summary=content["summary"],
            next_steps=content["next_steps"], limitations=content["limitations"],
            removed_findings=content["removed_findings"],
        ) if not ai_report.error else None
        result.report_error = ai_report.error
        result.selection.language = ai_report.language
        explanations = content.get("explanations", {})
        local_names = content.get("local_names", {})
        for finding in result.findings:
            finding.explanation = explanations.get(finding.name)
        result.checks = [c for c in result.checks if c.category != CheckCategory.REPORT]
        result.checks.append(_grounding_check(result.report, ai_report.error))

    if physician is not None:
        result.physician_report = PhysicianReport(
            **{k: physician.content.get(k, "") for k in ("findings", "impression", "recommendations")},
            status=physician.status,
            author=names.get(physician.author_id) if physician.author_id else None,
            updated_at=as_utc(physician.updated_at),
            signed_at=as_utc(physician.signed_at) if physician.signed_at else None,
        )
    result.suggested_report = suggested_sections(result, local_names)

    if review is not None:
        result.review = ReviewOut(
            action=ReviewAction(review.action),
            reviewer=names.get(review.reviewer_id, ""),
            notes=review.notes,
            final_impression=physician.content.get("impression") if physician else None,
            finding_decisions=review.finding_decisions,
            added_findings=review.added_findings,
            reviewed_at=as_utc(review.created_at),
        )

    if with_audit:
        events = session.exec(
            select(AuditEvent).where(AuditEvent.case_id == case.id).order_by(AuditEvent.id)
        ).all()
        result.audit = [
            AuditEventOut(
                id=e.id, timestamp=as_utc(e.timestamp), action=e.action, actor=e.actor,
                details=e.details, hash=e.hash,
            )
            for e in events
        ]
    return result


def reference_findings(result: AnalysisResult) -> list[str]:
    """The physician-confirmed findings: AI findings they agreed with plus those they added."""
    review = result.review
    if review is None:
        return []
    ai = [f.name for f in result.findings]
    if review.action is ReviewAction.REJECT and not review.finding_decisions:
        agreed = []
    else:
        agreed = [n for n in ai if review.finding_decisions.get(n, "agree") == "agree"]
    return sorted(set(agreed) | set(review.added_findings))


def candidate_labels(result: AnalysisResult) -> list[str]:
    return sorted({f.name for f in result.findings} | {s.name for s in result.other_scores})

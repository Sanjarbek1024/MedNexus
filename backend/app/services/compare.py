"""Prior comparison: score deltas between two studies of one patient, and an interval summary."""

from __future__ import annotations

import logging

from sqlmodel import Session, select

from app.db.audit import as_utc
from app.db.models import Case, CaseStatus, IntervalSummary
from app.schemas import AnalysisResult, Comparison, Delta
from app.services.assistant import interval_summary
from app.services.cases import assemble
from app.services.llm import LLM

logger = logging.getLogger(__name__)
STABLE_BAND = 0.05  # score changes smaller than this are "stable"


class ComparisonError(ValueError):
    pass


def _scores(result: AnalysisResult) -> dict[str, float]:
    return {s.name: s.score for s in result.other_scores} | {f.name: f.score for f in result.findings}


def deltas(prior: AnalysisResult, current: AnalysisResult) -> list[Delta]:
    before, after = _scores(prior), _scores(current)
    reported_before = {f.name for f in prior.findings}
    reported_after = {f.name for f in current.findings}
    rows = []
    for name in sorted(set(before) | set(after)):
        p, c = before.get(name), after.get(name)
        change = round(c - p, 4) if p is not None and c is not None else None
        if name in reported_after and name not in reported_before:
            trend = "new"
        elif name in reported_before and name not in reported_after:
            trend = "resolved"
        elif change is None or abs(change) < STABLE_BAND:
            trend = "stable"
        else:
            trend = "worsened" if change > 0 else "improved"
        rows.append(Delta(
            name=name, prior=p, current=c, change=change, trend=trend,
            reported=name in reported_before or name in reported_after,
        ))
    return sorted(rows, key=lambda d: (not d.reported, -abs(d.change or 0)))


def compare(session: Session, first: Case, second: Case, language: str, llm: LLM) -> Comparison:
    if first.id == second.id:
        raise ComparisonError("choose two different studies")
    if first.patient_id != second.patient_id:
        raise ComparisonError("both studies must belong to the same patient")
    if (first.modality, first.region) != (second.modality, second.region):
        raise ComparisonError("both studies must have the same modality and body region")
    analyzed = (CaseStatus.AI_READY, CaseStatus.REVIEWED)
    if first.status not in analyzed or second.status not in analyzed:
        raise ComparisonError("both studies must be analyzed and pass the safety gates")

    prior, current = sorted((first, second), key=lambda c: (as_utc(c.acquired_at), c.id))
    prior_result, current_result = assemble(session, prior), assemble(session, current)
    rows = deltas(prior_result, current_result)
    days = (as_utc(current.acquired_at) - as_utc(prior.acquired_at)).total_seconds() / 86400

    summary, error = _cached_summary(session, prior.id, current.id, language), None
    if summary is None:
        try:
            summary = interval_summary(llm, rows, days, language)
            session.add(IntervalSummary(
                prior_id=prior.id, current_id=current.id, language=language, summary=summary, model=llm.model,
            ))
            session.commit()
        except Exception as exc:  # the comparison is complete without the narrative
            logger.warning("Interval summary failed: %s", exc)
            error = str(exc) if not llm.configured else "the language model is unavailable"
    return Comparison(
        prior=prior_result, current=current_result, deltas=rows, interval_days=round(days, 1),
        summary=summary, summary_error=error,
    )


def _cached_summary(session: Session, prior_id: int, current_id: int, language: str) -> str | None:
    row = session.exec(
        select(IntervalSummary).where(
            IntervalSummary.prior_id == prior_id,
            IntervalSummary.current_id == current_id,
            IntervalSummary.language == language,
        )
    ).first()
    return row.summary if row else None

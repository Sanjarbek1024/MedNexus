"""Training mode: blind reads of physician-reviewed cases, scored against the physician's decision.

The training pool is every signed-off case (patients are pseudonymous), so residents can learn
from the whole department's reviewed studies, not only their own.
"""

from __future__ import annotations

import random
from collections import defaultdict

from sqlmodel import Session, col, func, select

from app.db.audit import as_utc
from app.db.models import Case, CaseStatus, TrainingAttempt, User
from app.schemas import (
    AIMistake,
    LabelOutcome,
    PathologyAccuracy,
    TrainingAttemptRequest,
    TrainingCase,
    TrainingReveal,
    TrainingStats,
)
from app.services.cases import assemble, candidate_labels, reference_findings


class TrainingCaseNotFoundError(LookupError):
    pass


def _pool(session: Session) -> list[int]:
    return list(session.exec(
        select(Case.id).where(Case.status == CaseStatus.REVIEWED).order_by(Case.id)
    ).all())


def next_case(session: Session, user: User, exclude: int | None = None) -> TrainingCase | None:
    pool = [case_id for case_id in _pool(session) if case_id != exclude]
    if not pool:
        return None
    counts = dict(session.exec(
        select(TrainingAttempt.case_id, func.count())
        .where(TrainingAttempt.user_id == user.id)
        .group_by(TrainingAttempt.case_id)
    ).all())
    fewest = min(counts.get(case_id, 0) for case_id in pool)
    case_id = random.choice([c for c in pool if counts.get(c, 0) == fewest])
    result = assemble(session, session.get(Case, case_id), with_audit=False)
    return TrainingCase(
        case_id=case_id,
        image=result.image,
        selection=result.selection,
        candidates=sorted(set(candidate_labels(result)) | set(result.not_assessed)),
        attempted=len(counts),
    )


def attempt(session: Session, user: User, case_id: int, request: TrainingAttemptRequest) -> TrainingReveal:
    case = session.get(Case, case_id)
    if case is None or case.status != CaseStatus.REVIEWED:
        raise TrainingCaseNotFoundError(case_id)
    result = assemble(session, case, with_audit=False)
    reference = reference_findings(result)
    ai = sorted(f.name for f in result.findings)
    candidates = sorted(set(candidate_labels(result)) | set(result.not_assessed) | set(reference))
    selected = sorted(set(request.selected) & set(candidates))

    outcomes = [
        LabelOutcome(name=name, resident=name in selected, reference=name in reference, ai=name in ai)
        for name in candidates
    ]
    tp = sum(o.resident and o.reference for o in outcomes)
    fp = sum(o.resident and not o.reference for o in outcomes)
    fn = sum(o.reference and not o.resident for o in outcomes)
    score = round(100 * tp / (tp + fp + fn), 1) if tp + fp + fn else 100.0
    ai_was_wrong = set(ai) != set(reference)

    marks = [
        {"x": min(max(float(m.get("x", 0)), 0.0), 1.0), "y": min(max(float(m.get("y", 0)), 0.0), 1.0)}
        for m in request.marks
    ]
    row = TrainingAttempt(
        user_id=user.id, case_id=case_id, selected=selected, marks=marks, reference=reference,
        candidates=candidates, score=score, ai_was_wrong=ai_was_wrong,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return TrainingReveal(
        attempt_id=row.id, score=score, outcomes=outcomes, reference=reference, ai_findings=ai,
        ai_was_wrong=ai_was_wrong,
        reviewer=result.review.reviewer if result.review else None,
        impression=result.physician_report.impression if result.physician_report else None,
        result=result,
    )


def stats(session: Session, user: User) -> TrainingStats:
    attempts = session.exec(
        select(TrainingAttempt).where(TrainingAttempt.user_id == user.id).order_by(col(TrainingAttempt.id).desc())
    ).all()
    tally: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "correct": 0, "tp": 0, "fn": 0, "fp": 0})
    for a in attempts:
        for name in a.candidates:
            said, truth = name in a.selected, name in a.reference
            t = tally[name]
            t["n"] += 1
            t["correct"] += said == truth
            t["tp"] += said and truth
            t["fn"] += truth and not said
            t["fp"] += said and not truth
    per_pathology = [
        PathologyAccuracy(
            name=name, attempts=t["n"], correct=t["correct"], false_positives=t["fp"],
            sensitivity=round(t["tp"] / (t["tp"] + t["fn"]), 3) if t["tp"] + t["fn"] else None,
        )
        for name, t in sorted(tally.items(), key=lambda item: (-(item[1]["tp"] + item[1]["fn"]), item[0]))
    ]
    return TrainingStats(
        attempts=len(attempts),
        average_score=round(sum(a.score for a in attempts) / len(attempts), 1) if attempts else None,
        per_pathology=per_pathology,
        recent=[
            {"case_id": a.case_id, "score": a.score, "ai_was_wrong": a.ai_was_wrong,
             "created_at": as_utc(a.created_at).isoformat()}
            for a in attempts[:10]
        ],
    )


def ai_mistakes(session: Session, limit: int = 30) -> list[AIMistake]:
    """Reviewed cases where the physician disagreed with the AI or added a finding it missed."""
    mistakes = []
    for case_id in reversed(_pool(session)):
        result = assemble(session, session.get(Case, case_id), with_audit=False)
        reference, ai = set(reference_findings(result)), {f.name for f in result.findings}
        if reference == ai or result.review is None:
            continue
        case = session.get(Case, case_id)
        mistakes.append(AIMistake(
            case_id=case_id,
            thumbnail=case.thumbnail,
            study=f"{case.modality}/{case.region}/{case.view}",
            ai_findings=sorted(ai),
            reference=sorted(reference),
            missed_by_ai=sorted(reference - ai),
            false_alarms=sorted(ai - reference),
            reviewer=result.review.reviewer,
            notes=result.review.notes,
        ))
        if len(mistakes) >= limit:
            break
    return mistakes

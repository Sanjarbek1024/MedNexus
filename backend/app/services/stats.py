"""Dashboard metrics and post-deployment safety monitoring, computed from stored timestamps and
review decisions only (nothing here is estimated or simulated)."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, func, select

from app.db.audit import as_utc
from app.db.models import Analysis, Case, CaseStatus, Priority, Report, Review, User
from app.schemas import (
    DailyCount,
    DashboardStats,
    PathologyAgreement,
    SafetyStats,
    WeeklyAgreement,
)
from app.services.cases import summaries, visible

OPEN = (CaseStatus.QUEUED, CaseStatus.ANALYZING, CaseStatus.AI_READY)


def _day_start(now: datetime, tz_offset_minutes: int) -> datetime:
    """Start of the viewer's local day, in UTC. ``tz_offset_minutes`` follows JS getTimezoneOffset."""
    local = now - timedelta(minutes=tz_offset_minutes)
    return local.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=tz_offset_minutes)


def _count(session: Session, statement) -> int:  # noqa: ANN001
    return session.exec(statement).one()


def dashboard(session: Session, user: User, tz_offset_minutes: int = 0) -> DashboardStats:
    now = datetime.now(timezone.utc)
    today = _day_start(now, tz_offset_minutes)
    count = visible(select(func.count()).select_from(Case), user)

    reviewed = session.exec(
        visible(select(Case), user).where(Case.status == CaseStatus.REVIEWED, Case.reviewed_at >= now - timedelta(days=30))
    ).all()
    turnaround = [
        (as_utc(c.reviewed_at) - as_utc(c.created_at)).total_seconds() / 60 for c in reviewed if c.reviewed_at
    ]
    reviews = session.exec(
        select(Review).where(col(Review.case_id).in_([c.id for c in reviewed]))
    ).all() if reviewed else []
    decisions = [d for r in reviews for d in r.finding_decisions.values()]

    week_start = today - timedelta(days=6)
    recent = session.exec(visible(select(Case), user).where(Case.created_at >= week_start)).all()
    reviewed_recent = session.exec(
        visible(select(Case), user).where(Case.reviewed_at >= week_start)
    ).all()
    daily = []
    for offset in range(7):
        start = week_start + timedelta(days=offset)
        end = start + timedelta(days=1)
        daily.append(DailyCount(
            day=(start - timedelta(minutes=tz_offset_minutes)).date().isoformat(),
            uploaded=sum(start <= as_utc(c.created_at) < end for c in recent),
            reviewed=sum(c.reviewed_at is not None and start <= as_utc(c.reviewed_at) < end for c in reviewed_recent),
        ))

    urgent = session.exec(
        visible(select(Case), user)
        .where(col(Case.status).in_(OPEN), Case.priority == Priority.URGENT)
        .order_by(Case.created_at)
        .limit(5)
    ).all()
    return DashboardStats(
        open_cases=_count(session, count.where(col(Case.status).in_(OPEN))),
        urgent_open=_count(session, count.where(col(Case.status).in_(OPEN), Case.priority == Priority.URGENT)),
        queued_today=_count(session, count.where(Case.created_at >= today)),
        reviewed_today=_count(session, count.where(Case.reviewed_at >= today)),
        avg_turnaround_minutes=round(sum(turnaround) / len(turnaround), 1) if turnaround else None,
        agreement_rate=round(decisions.count("agree") / len(decisions), 3) if decisions else None,
        decisions=len(decisions),
        daily=daily,
        urgent_cases=summaries(session, list(urgent)),
    )


def safety(session: Session) -> SafetyStats:
    analyses = session.exec(select(Analysis)).all()
    latest = {a.case_id: a for a in sorted(analyses, key=lambda a: a.id)}.values()
    rejected = [a for a in latest if a.summary.get("rejected_by")]
    reasons = Counter(check for a in rejected for check in a.summary["rejected_by"])
    findings = [f for a in latest for f in a.summary.get("findings", [])]

    reviews = session.exec(select(Review).order_by(Review.id)).all()
    latest_reviews = {r.case_id: r for r in reviews}.values()
    per_name: dict[str, Counter] = defaultdict(Counter)
    for review in latest_reviews:
        for name, decision in review.finding_decisions.items():
            per_name[name][decision] += 1
        for name in review.added_findings:
            per_name[name]["missed"] += 1
    decisions = [d for r in latest_reviews for d in r.finding_decisions.values()]

    weekly = []
    now = datetime.now(timezone.utc)
    for weeks_ago in range(7, -1, -1):
        start = now - timedelta(weeks=weeks_ago + 1)
        end = start + timedelta(weeks=1)
        week_decisions = [
            d for r in latest_reviews if start <= as_utc(r.created_at) < end for d in r.finding_decisions.values()
        ]
        weekly.append(WeeklyAgreement(
            week=start.date().isoformat(),
            decisions=len(week_decisions),
            agreement_rate=round(week_decisions.count("agree") / len(week_decisions), 3) if week_decisions else None,
        ))

    ai_reports = session.exec(select(Report).where(Report.kind == "ai")).all()
    return SafetyStats(
        analyses=len(latest),
        rejected_images=len(rejected),
        rejection_reasons=dict(reasons),
        low_confidence_rate=round(sum(f["level"] == "uncertain" for f in findings) / len(findings), 3) if findings else None,
        model_disagreement_rate=round(sum(not f["agree"] for f in findings) / len(findings), 3) if findings else None,
        override_rate=round(decisions.count("disagree") / len(decisions), 3) if decisions else None,
        per_pathology=[
            PathologyAgreement(name=name, agree=c["agree"], disagree=c["disagree"], missed=c["missed"])
            for name, c in sorted(per_name.items(), key=lambda item: -sum(item[1].values()))
        ],
        weekly=weekly,
        llm_removed_items=sum(len(r.content.get("removed_findings", [])) for r in ai_reports),
    )

"""AI urgency flag for the worklist. It orders the queue; it is not a diagnosis."""

from collections.abc import Collection

from app.analyzers.base import Level
from app.db.models import Priority
from app.schemas import FindingOut


def prioritize(findings: list[FindingOut], urgent_findings: Collection[str]) -> tuple[Priority, str | None]:
    """Urgent: a time-critical finding at high confidence. Attention: any other signal worth a
    prompt look (a time-critical finding at lower confidence, or any high/moderate finding)."""
    critical = [f for f in findings if f.name in urgent_findings]
    urgent = [f for f in critical if f.level is Level.HIGH]
    if urgent:
        return Priority.URGENT, ", ".join(f"{f.name} {f.score:.2f}" for f in urgent)
    notable = critical or [f for f in findings if f.level in (Level.HIGH, Level.MODERATE)]
    if notable:
        return Priority.ATTENTION, ", ".join(f"{f.name} {f.score:.2f}" for f in notable)
    return Priority.ROUTINE, None

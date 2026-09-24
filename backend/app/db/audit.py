"""Tamper-evident audit log: every event is chained to the previous one with SHA-256.

The table is append-only at the database level (triggers refuse UPDATE and DELETE); the hash
chain additionally exposes any change made by someone who bypasses the triggers.
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone

from sqlalchemy import text
from sqlmodel import Session, select

from app.db.models import AuditEvent

GENESIS_HASH = "0" * 64
_append_lock = threading.Lock()


def as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; everything is stored in UTC."""
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def event_hash(prev_hash: str, event: AuditEvent) -> str:
    body = json.dumps(
        {
            "case_id": event.case_id,
            "user_id": event.user_id,
            "timestamp": as_utc(event.timestamp).isoformat(),
            "action": event.action,
            "actor": event.actor,
            "details": event.details,
        },
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256((prev_hash + body).encode("utf-8")).hexdigest()


def record(
    session: Session,
    action: str,
    actor: str,
    details: dict,
    *,
    user_id: int | None = None,
    case_id: int | None = None,
) -> AuditEvent:
    """Append one event and commit it."""
    with _append_lock:
        if session.get_bind().dialect.name == "postgresql":
            # Serializes appends across processes so the chain never forks.
            session.execute(text("SELECT pg_advisory_xact_lock(727274)"))
        last = session.exec(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(1)).first()
        prev_hash = last.hash if last else GENESIS_HASH
        event = AuditEvent(
            case_id=case_id, user_id=user_id, action=action, actor=actor,
            details=json.loads(json.dumps(details, default=str)), prev_hash=prev_hash, hash="",
        )
        event.hash = event_hash(prev_hash, event)
        session.add(event)
        session.commit()
        session.refresh(event)
        return event


def verify(session: Session) -> tuple[bool, int, int | None]:
    """(valid, event count, id of the first event that breaks the chain)."""
    events = session.exec(select(AuditEvent).order_by(AuditEvent.id)).all()
    prev_hash = GENESIS_HASH
    for event in events:
        if event.prev_hash != prev_hash or event_hash(prev_hash, event) != event.hash:
            return False, len(events), event.id
        prev_hash = event.hash
    return True, len(events), None

"""Case persistence and the tamper-evident audit log."""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.models import AuditEvent, Case, utcnow
from app.schemas import AnalysisResult, AuditEventOut, AuditVerification, CaseSummary

GENESIS_HASH = "0" * 64


class CaseNotFoundError(LookupError):
    pass


def as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; everything is stored in UTC."""
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _event_hash(prev_hash: str, event: AuditEvent) -> str:
    body = json.dumps(
        {
            "case_id": event.case_id,
            "timestamp": as_utc(event.timestamp).isoformat(),
            "action": event.action,
            "actor": event.actor,
            "details": event.details,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256((prev_hash + body).encode("utf-8")).hexdigest()


class CaseStore:
    def __init__(self, data_dir: Path) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(
            f"sqlite:///{data_dir / 'mednexus.db'}", connect_args={"check_same_thread": False}
        )
        SQLModel.metadata.create_all(self.engine)
        self._append_lock = threading.Lock()

    def create(
        self,
        result: AnalysisResult,
        thumbnail: str,
        raw_scores: dict[str, dict[str, float]],
    ) -> int:
        top = result.findings[0].name if result.findings else None
        case = Case(
            created_at=result.created_at,
            status=result.status,
            image_sha256=result.image.sha256,
            modality=result.selection.modality,
            region=result.selection.region,
            view=result.selection.view,
            headline=top,
            finding_count=len(result.findings),
            thumbnail=thumbnail,
            model_versions=result.versions,
            raw_scores=raw_scores,
            result={},
        )
        with Session(self.engine) as session:
            session.add(case)
            session.commit()
            session.refresh(case)
            result.case_id = case.id
            case.result = result.model_dump(mode="json", exclude={"audit"})
            session.add(case)
            session.commit()
            assert case.id is not None
            return case.id

    def load(self, case_id: int) -> AnalysisResult:
        with Session(self.engine) as session:
            case = session.get(Case, case_id)
            if case is None:
                raise CaseNotFoundError(case_id)
            result = AnalysisResult.model_validate(case.result)
            events = session.exec(
                select(AuditEvent).where(AuditEvent.case_id == case_id).order_by(AuditEvent.id)
            ).all()
        result.audit = [
            AuditEventOut(
                id=e.id, timestamp=as_utc(e.timestamp), action=e.action, actor=e.actor,
                details=e.details, hash=e.hash,
            )
            for e in events
        ]
        return result

    def save(self, result: AnalysisResult) -> None:
        """Persist an updated result (new report or review)."""
        with Session(self.engine) as session:
            case = session.get(Case, result.case_id)
            if case is None:
                raise CaseNotFoundError(result.case_id)
            case.result = result.model_dump(mode="json", exclude={"audit"})
            case.status = result.status
            case.reviewer = result.review.reviewer if result.review else None
            case.updated_at = utcnow()
            session.add(case)
            session.commit()

    def list(self, limit: int, offset: int) -> tuple[list[CaseSummary], int]:
        with Session(self.engine) as session:
            total = session.exec(select(func.count()).select_from(Case)).one()
            rows = session.exec(
                select(
                    Case.id, Case.created_at, Case.status, Case.modality, Case.region, Case.view,
                    Case.headline, Case.finding_count, Case.thumbnail, Case.reviewer,
                )
                .order_by(Case.id.desc())
                .offset(offset)
                .limit(limit)
            ).all()
        summaries = [
            CaseSummary(**{**row._mapping, "created_at": as_utc(row.created_at)}) for row in rows
        ]
        return summaries, total

    def log(self, case_id: int, action: str, actor: str, details: dict) -> None:
        with self._append_lock, Session(self.engine) as session:
            last = session.exec(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(1)).first()
            prev_hash = last.hash if last else GENESIS_HASH
            event = AuditEvent(
                case_id=case_id, action=action, actor=actor, details=details,
                prev_hash=prev_hash, hash="",
            )
            event.hash = _event_hash(prev_hash, event)
            session.add(event)
            session.commit()

    def verify(self) -> AuditVerification:
        """Recompute the hash chain; any edited or deleted event breaks it."""
        prev_hash = GENESIS_HASH
        with Session(self.engine) as session:
            events = session.exec(select(AuditEvent).order_by(AuditEvent.id)).all()
        for event in events:
            if event.prev_hash != prev_hash or _event_hash(prev_hash, event) != event.hash:
                return AuditVerification(valid=False, events=len(events), first_invalid_event=event.id)
            prev_hash = event.hash
        return AuditVerification(valid=True, events=len(events))

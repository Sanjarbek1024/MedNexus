"""SQLite tables: one row per case, plus an append-only, hash-chained audit trail.

No patient identifiers are stored: no file names and no DICOM header fields, only the
pixel-derived images, the image hash and the analysis itself.
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Case(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)
    status: str = Field(index=True)
    image_sha256: str = Field(index=True)
    modality: str
    region: str
    view: str
    headline: str | None = None
    finding_count: int = 0
    thumbnail: str
    model_versions: dict = Field(sa_column=Column(JSON, nullable=False))
    raw_scores: dict = Field(sa_column=Column(JSON, nullable=False))
    result: dict = Field(sa_column=Column(JSON, nullable=False))  # AnalysisResult, incl. report
    reviewer: str | None = None


class AuditEvent(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id", index=True)
    timestamp: datetime = Field(default_factory=utcnow)
    action: str
    actor: str
    details: dict = Field(sa_column=Column(JSON, nullable=False))
    prev_hash: str
    hash: str

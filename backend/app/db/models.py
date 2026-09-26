"""Database tables.

Patients are pseudonymous: no names, identifiers or birth dates are stored anywhere. Uploaded
DICOM files are anonymized before they are written to disk, and raster images are re-encoded
without metadata.
"""

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import JSON, Column, DateTime, Index, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(nullable: bool = False, index: bool = False) -> Column:
    return Column(DateTime(timezone=True), nullable=nullable, index=index)


def _json(nullable: bool = False) -> Column:
    return Column(JSON, nullable=nullable)


class Role(StrEnum):
    DOCTOR = "doctor"  # MedNexus is a physician tool: worklist, differential, review and sign-off

# Cases without an image use this modality marker; imaging can be attached later.
CLINICAL = "clinical"


class CaseStatus(StrEnum):
    QUEUED = "queued"  # uploaded, waiting for the background analyzer
    ANALYZING = "analyzing"
    AI_READY = "ai_ready"  # AI draft awaiting physician review
    REVIEWED = "reviewed"  # signed off by a physician
    IMAGE_REJECTED = "image_rejected"  # failed a safety gate; nothing to review
    FAILED = "failed"


class Priority(StrEnum):
    URGENT = "urgent"
    ATTENTION = "attention"
    ROUTINE = "routine"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(max_length=254, unique=True, index=True)
    full_name: str = Field(max_length=120)
    role: str = Field(max_length=20)
    password_hash: str = Field(max_length=255)
    language: str = Field(default="uz", max_length=5)
    is_active: bool = True
    failed_logins: int = 0
    locked_until: datetime | None = Field(default=None, sa_column=_timestamp(nullable=True))
    token_version: int = 0  # bumped to revoke every outstanding refresh token
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp())
    last_login_at: datetime | None = Field(default=None, sa_column=_timestamp(nullable=True))


class Patient(SQLModel, table=True):
    __tablename__ = "patients"
    __table_args__ = (UniqueConstraint("owner_id", "source_hash"),)

    id: int | None = Field(default=None, primary_key=True)
    pseudonym: str = Field(max_length=16, unique=True, index=True)
    # HMAC of the DICOM PatientID, so later studies of the same patient link automatically.
    source_hash: str | None = Field(default=None, max_length=64)
    owner_id: int = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp())


class Case(SQLModel, table=True):
    __tablename__ = "cases"
    __table_args__ = (Index("ix_cases_owner_status_priority", "owner_id", "status", "priority"),)

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id", index=True)
    patient_id: int = Field(foreign_key="patients.id", index=True)
    status: str = Field(max_length=20, index=True)
    priority: str = Field(default=Priority.ROUTINE, max_length=12, index=True)
    priority_reason: str | None = Field(default=None, max_length=255)
    modality: str = Field(max_length=20)
    region: str = Field(max_length=20)
    view: str = Field(max_length=20)
    language: str = Field(max_length=5)
    image_sha256: str = Field(max_length=64, index=True)
    image_format: str = Field(max_length=10)
    upload_path: str = Field(max_length=255)  # sanitized upload, relative to the uploads dir
    thumbnail: str | None = None
    headline: str | None = Field(default=None, max_length=120)
    finding_count: int = 0
    error: str | None = Field(default=None, max_length=255)
    # What the person reports alongside the image; used by the multimodal assessment.
    symptoms: str | None = Field(default=None, max_length=2000)
    patient_age: int | None = None
    patient_sex: str | None = Field(default=None, max_length=10)
    # Structured intake (ClinicalData): complaint, symptoms, vitals, history, exam, labs.
    clinical: dict | None = Field(default=None, sa_column=_json(nullable=True))
    acquired_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp(index=True))
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp(index=True))
    analyzed_at: datetime | None = Field(default=None, sa_column=_timestamp(nullable=True))
    reviewed_at: datetime | None = Field(default=None, sa_column=_timestamp(nullable=True))


class Analysis(SQLModel, table=True):
    __tablename__ = "analyses"

    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="cases.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp())
    model_versions: dict = Field(sa_column=_json())
    raw_scores: dict = Field(sa_column=_json())
    # Compact per-finding levels and gate outcomes, so monitoring never loads the overlays.
    summary: dict = Field(sa_column=_json())
    result: dict = Field(sa_column=_json())  # model outputs, checks, overlays (API schema)


class Report(SQLModel, table=True):
    """AI drafts (one row per generation) and the physician's structured report."""

    __tablename__ = "reports"

    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="cases.id", index=True)
    kind: str = Field(max_length=10)  # "ai" | "physician" | "assessment"
    language: str = Field(max_length=5)
    content: dict = Field(sa_column=_json())
    model: str | None = Field(default=None, max_length=80)
    error: str | None = Field(default=None, max_length=255)
    author_id: int | None = Field(default=None, foreign_key="users.id")
    status: str = Field(default="draft", max_length=10)  # "draft" | "final"
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp())
    signed_at: datetime | None = Field(default=None, sa_column=_timestamp(nullable=True))


class Review(SQLModel, table=True):
    __tablename__ = "reviews"

    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="cases.id", index=True)
    reviewer_id: int = Field(foreign_key="users.id", index=True)
    action: str = Field(max_length=10)  # confirm | edit | reject
    notes: str = ""
    finding_decisions: dict = Field(sa_column=_json())  # finding -> "agree" | "disagree"
    added_findings: list = Field(sa_column=_json())  # findings the AI missed
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp(index=True))


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_case_created", "case_id", "created_at"),)

    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="cases.id")
    user_id: int | None = Field(default=None, foreign_key="users.id")
    role: str = Field(max_length=10)  # "user" | "assistant"
    content: str
    language: str = Field(max_length=5)
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp())


class IntervalSummary(SQLModel, table=True):
    """Cached LLM summary of the change between two studies of one patient."""

    __tablename__ = "interval_summaries"
    __table_args__ = (UniqueConstraint("prior_id", "current_id", "language"),)

    id: int | None = Field(default=None, primary_key=True)
    prior_id: int = Field(foreign_key="cases.id")
    current_id: int = Field(foreign_key="cases.id")
    language: str = Field(max_length=5)
    summary: str
    model: str = Field(max_length=80)
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp())


class TrainingAttempt(SQLModel, table=True):
    __tablename__ = "training_attempts"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    case_id: int = Field(foreign_key="cases.id", index=True)
    selected: list = Field(sa_column=_json())
    marks: list = Field(sa_column=_json())  # [{"x": 0-1, "y": 0-1}] on the image
    reference: list = Field(sa_column=_json())  # radiologist-confirmed findings
    candidates: list = Field(sa_column=_json())  # labels the resident could choose from
    score: float
    ai_was_wrong: bool
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp(index=True))


class AuditEvent(SQLModel, table=True):
    """Append-only (enforced by database triggers) and hash-chained."""

    __tablename__ = "audit_events"

    id: int | None = Field(default=None, primary_key=True)
    case_id: int | None = Field(default=None, foreign_key="cases.id", index=True)
    user_id: int | None = Field(default=None, foreign_key="users.id", index=True)
    timestamp: datetime = Field(default_factory=utcnow, sa_column=_timestamp(index=True))
    action: str = Field(max_length=40, index=True)
    actor: str = Field(max_length=120)
    details: dict = Field(sa_column=_json())
    prev_hash: str = Field(max_length=64)
    hash: str = Field(max_length=64)

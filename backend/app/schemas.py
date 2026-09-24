"""Public API models."""

from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.analyzers.base import CheckCategory, CheckStatus, Level
from app.db.models import CaseStatus, Priority, Role

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --- System -----------------------------------------------------------------------------------

class ViewOption(BaseModel):
    id: str
    label: str
    supported: bool
    analyzers: list[str]


class RegionOption(BaseModel):
    id: str
    label: str
    supported: bool
    views: list[ViewOption]


class ModalityOption(BaseModel):
    id: str
    label: str
    supported: bool
    regions: list[RegionOption]


class LanguageOption(BaseModel):
    id: str
    label: str


class Capabilities(BaseModel):
    modalities: list[ModalityOption]
    languages: list[LanguageOption]
    default_language: str


class AnalyzerStatus(BaseModel):
    id: str
    label: str
    versions: dict[str, str]


class LLMStatus(BaseModel):
    provider: Literal["groq"] = "groq"
    model: str
    configured: bool


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
    device: str
    database: str
    analyzers: list[AnalyzerStatus]
    llm: LLMStatus


# --- Auth & users -----------------------------------------------------------------------------

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role
    language: str
    created_at: datetime


class RegisterRequest(BaseModel):
    email: str = Field(max_length=254)
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(max_length=128)
    role: Literal[Role.RADIOLOGIST, Role.RESIDENT] = Role.RADIOLOGIST
    language: Literal["uz", "en", "ru"] = "uz"

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        value = value.strip().lower()
        if not _EMAIL.match(value):
            raise ValueError("enter a valid email address")
        return value


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    language: Literal["uz", "en", "ru"] | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


class AdminUserUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None
    unlock: bool = False


class AdminUserOut(UserOut):
    is_active: bool
    locked: bool
    last_login_at: datetime | None


# --- Analysis result --------------------------------------------------------------------------

class Selection(BaseModel):
    modality: str
    region: str
    view: str
    language: str


class BoxOut(BaseModel):
    x: float
    y: float
    width: float
    height: float


class DetectionOut(BoxOut):
    score: float


class ImageOut(BaseModel):
    url: str
    width: int
    height: int
    format: str
    sha256: str


class CheckOut(BaseModel):
    id: str
    category: CheckCategory
    label: str
    status: CheckStatus
    detail: str
    blocking: bool
    code: str | None = None  # message key for translated UI text
    params: dict[str, str | float | int] = Field(default_factory=dict)


class HeatmapOut(BaseModel):
    url: str
    box: BoxOut


class FindingOut(BaseModel):
    name: str
    score: float = Field(description="Model score (see thresholds). Not a probability.")
    level: Level
    model_scores: dict[str, float]
    models_agree: bool
    heatmap: HeatmapOut | None = None
    boxes: list[DetectionOut] = Field(default_factory=list)
    explanation: str | None = None


class ScoreOut(BaseModel):
    name: str
    score: float


class StructureOut(BaseModel):
    label: str
    path: str  # SVG path in mask pixel coordinates
    size: int  # mask side length (the SVG viewBox)
    box: BoxOut


class MeasurementOut(BaseModel):
    id: str
    label: str
    value: float
    reference: float | None
    detail: str


class Report(BaseModel):
    language: str
    model: str
    summary: str
    next_steps: list[str]
    limitations: list[str]
    removed_findings: list[str] = Field(
        description="Findings the language model mentioned that the image models did not produce."
    )


class ReportSections(BaseModel):
    findings: str = Field(default="", max_length=8000)
    impression: str = Field(default="", max_length=8000)
    recommendations: str = Field(default="", max_length=8000)


class PhysicianReport(ReportSections):
    status: Literal["draft", "final"]
    author: str | None
    updated_at: datetime
    signed_at: datetime | None


class ReviewAction(StrEnum):
    CONFIRM = "confirm"
    EDIT = "edit"
    REJECT = "reject"


class ReviewRequest(BaseModel):
    """Physician sign-off. ``report`` defaults to the AI draft when omitted."""

    action: ReviewAction
    notes: str = Field(default="", max_length=4000)
    final_impression: str | None = Field(default=None, max_length=8000)
    report: ReportSections | None = None
    finding_decisions: dict[str, Literal["agree", "disagree"]] = Field(default_factory=dict)
    added_findings: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def _require_context(self) -> ReviewRequest:
        if self.action is ReviewAction.REJECT and not self.notes.strip():
            raise ValueError("a reason is required to reject the AI draft")
        edited = (self.final_impression or "").strip() or (self.report and self.report.impression.strip())
        if self.action is ReviewAction.EDIT and not edited:
            raise ValueError("an edited impression is required")
        return self


class Review(BaseModel):
    action: ReviewAction
    reviewer: str
    notes: str
    final_impression: str | None
    finding_decisions: dict[str, str]
    added_findings: list[str]
    reviewed_at: datetime


class AuditEventOut(BaseModel):
    id: int
    timestamp: datetime
    action: str
    actor: str
    details: dict
    hash: str


class PatientRef(BaseModel):
    id: int
    pseudonym: str


class AnalysisResult(BaseModel):
    case_id: int | None = None
    created_at: datetime
    status: CaseStatus
    priority: Priority = Priority.ROUTINE
    priority_reason: str | None = None
    patient: PatientRef | None = None
    owner: str | None = None
    acquired_at: datetime | None = None
    selection: Selection
    image: ImageOut
    rejected: bool
    rejection_reasons: list[str]
    checks: list[CheckOut]
    findings: list[FindingOut]
    other_scores: list[ScoreOut]
    not_assessed: list[str]
    thresholds: dict[str, float]
    structures: list[StructureOut]
    measurements: list[MeasurementOut]
    report: Report | None = None
    report_error: str | None = None
    physician_report: PhysicianReport | None = None
    suggested_report: ReportSections | None = None  # AI-prefilled structured report
    versions: dict[str, dict[str, str]]
    timings_ms: dict[str, int]
    review: Review | None = None
    audit: list[AuditEventOut] = Field(default_factory=list)


class ReportRequest(BaseModel):
    language: Literal["uz", "en", "ru"]


# --- Cases & worklist -------------------------------------------------------------------------

class CaseSummary(BaseModel):
    id: int
    created_at: datetime
    acquired_at: datetime
    status: CaseStatus
    priority: Priority
    priority_reason: str | None
    modality: str
    region: str
    view: str
    headline: str | None
    finding_count: int
    thumbnail: str | None
    patient: PatientRef
    owner: str
    reviewer: str | None
    reviewed_at: datetime | None
    error: str | None


class CaseList(BaseModel):
    items: list[CaseSummary]
    total: int


class BatchUploadResult(BaseModel):
    queued: list[CaseSummary]
    rejected: list[dict[str, str]]  # {"file": ..., "reason": ...}


class AuditVerification(BaseModel):
    valid: bool
    events: int
    first_invalid_event: int | None = None


# --- Chat -------------------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: Literal["uz", "en", "ru"] = "uz"


class ChatMessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    language: str
    author: str | None
    created_at: datetime


# --- Patients & comparison --------------------------------------------------------------------

class PatientSummary(BaseModel):
    id: int
    pseudonym: str
    case_count: int
    last_study_at: datetime | None


class CompareRequest(BaseModel):
    prior_id: int
    current_id: int
    language: Literal["uz", "en", "ru"] = "uz"


class Delta(BaseModel):
    name: str
    prior: float | None
    current: float | None
    change: float | None
    trend: Literal["improved", "stable", "worsened", "new", "resolved"]
    reported: bool  # reported (above threshold) in either study


class Comparison(BaseModel):
    prior: AnalysisResult
    current: AnalysisResult
    deltas: list[Delta]
    interval_days: float
    summary: str | None
    summary_error: str | None


# --- Training ---------------------------------------------------------------------------------

class TrainingCase(BaseModel):
    case_id: int
    image: ImageOut
    selection: Selection
    candidates: list[str]
    attempted: int  # training cases this user has already read


class TrainingAttemptRequest(BaseModel):
    selected: list[str] = Field(default_factory=list, max_length=40)
    marks: list[dict[str, float]] = Field(default_factory=list, max_length=20)


class LabelOutcome(BaseModel):
    name: str
    resident: bool
    reference: bool
    ai: bool


class TrainingReveal(BaseModel):
    attempt_id: int
    score: float
    outcomes: list[LabelOutcome]
    reference: list[str]
    ai_findings: list[str]
    ai_was_wrong: bool
    reviewer: str | None
    impression: str | None
    result: AnalysisResult


class PathologyAccuracy(BaseModel):
    name: str
    attempts: int
    correct: int
    sensitivity: float | None  # TP / (TP + FN) against the radiologist reference
    false_positives: int


class TrainingStats(BaseModel):
    attempts: int
    average_score: float | None
    per_pathology: list[PathologyAccuracy]
    recent: list[dict]  # [{"case_id", "score", "created_at"}]


class AIMistake(BaseModel):
    case_id: int
    thumbnail: str | None
    study: str
    ai_findings: list[str]
    reference: list[str]
    missed_by_ai: list[str]
    false_alarms: list[str]
    reviewer: str
    notes: str


# --- Stats ------------------------------------------------------------------------------------

class DailyCount(BaseModel):
    day: str
    uploaded: int
    reviewed: int


class DashboardStats(BaseModel):
    open_cases: int
    urgent_open: int
    queued_today: int
    reviewed_today: int
    avg_turnaround_minutes: float | None
    agreement_rate: float | None
    decisions: int
    daily: list[DailyCount]
    urgent_cases: list[CaseSummary]


class PathologyAgreement(BaseModel):
    name: str
    agree: int
    disagree: int
    missed: int  # added by physicians (AI false negatives)


class WeeklyAgreement(BaseModel):
    week: str
    agreement_rate: float | None
    decisions: int


class SafetyStats(BaseModel):
    analyses: int
    rejected_images: int
    rejection_reasons: dict[str, int]
    low_confidence_rate: float | None
    model_disagreement_rate: float | None
    override_rate: float | None
    per_pathology: list[PathologyAgreement]
    weekly: list[WeeklyAgreement]
    llm_removed_items: int

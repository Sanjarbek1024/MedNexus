"""Public API models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.analyzers.base import CheckCategory, CheckStatus, Level


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
    analyzers: list[AnalyzerStatus]
    llm: LLMStatus


class CaseStatus(StrEnum):
    IMAGE_REJECTED = "image_rejected"  # failed a safety gate; nothing to review
    DRAFT = "draft"  # AI draft, awaiting physician review
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    EDITED = "edited"


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


class HeatmapOut(BaseModel):
    url: str
    box: BoxOut


class FindingOut(BaseModel):
    name: str
    score: float = Field(description="Ensemble model score (0.5 = decision threshold). Not a probability.")
    level: Level
    model_scores: dict[str, float]
    models_agree: bool
    heatmap: HeatmapOut | None = None
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


class ReviewAction(StrEnum):
    CONFIRM = "confirm"
    REJECT = "reject"
    EDIT = "edit"


class ReviewRequest(BaseModel):
    action: ReviewAction
    reviewer: str = Field(min_length=1, max_length=120)
    notes: str = Field(default="", max_length=4000)
    final_impression: str | None = Field(default=None, max_length=8000)

    @model_validator(mode="after")
    def _require_context(self) -> ReviewRequest:
        if self.action is ReviewAction.REJECT and not self.notes.strip():
            raise ValueError("a reason is required to reject the AI draft")
        if self.action is ReviewAction.EDIT and not (self.final_impression or "").strip():
            raise ValueError("an edited impression is required")
        return self


class Review(BaseModel):
    action: ReviewAction
    reviewer: str
    notes: str
    final_impression: str | None
    reviewed_at: datetime


class AuditEventOut(BaseModel):
    id: int
    timestamp: datetime
    action: str
    actor: str
    details: dict
    hash: str


class AnalysisResult(BaseModel):
    case_id: int | None = None
    created_at: datetime
    status: CaseStatus
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
    versions: dict[str, dict[str, str]]
    timings_ms: dict[str, int]
    review: Review | None = None
    audit: list[AuditEventOut] = Field(default_factory=list)


class ReportRequest(BaseModel):
    language: str


class CaseSummary(BaseModel):
    id: int
    created_at: datetime
    status: CaseStatus
    modality: str
    region: str
    view: str
    headline: str | None
    finding_count: int
    thumbnail: str
    reviewer: str | None


class CaseList(BaseModel):
    items: list[CaseSummary]
    total: int


class AuditVerification(BaseModel):
    valid: bool
    events: int
    first_invalid_event: int | None = None

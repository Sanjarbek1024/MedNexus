"""Patients & prior comparison, training mode, dashboard and safety monitoring."""

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlmodel import col, select

from app.api.deps import Admin, CurrentUser, LLMDep, SessionDep
from app.db.audit import as_utc
from app.db.models import Case, Patient, Role
from app.schemas import (
    AIMistake,
    Comparison,
    CompareRequest,
    DashboardStats,
    PatientSummary,
    SafetyStats,
    TrainingAttemptRequest,
    TrainingCase,
    TrainingReveal,
    TrainingStats,
)
from app.services import stats, training
from app.services.cases import CaseNotFoundError, get_case
from app.services.compare import ComparisonError, compare

router = APIRouter()


@router.get("/patients", response_model=list[PatientSummary], tags=["patients"])
def list_patients(
    user: CurrentUser, session: SessionDep, q: str | None = Query(None, max_length=40), min_cases: int = Query(1, ge=1)
) -> list[PatientSummary]:
    statement = (
        select(Patient, func.count(col(Case.id)), func.max(Case.acquired_at))
        .join(Case, Case.patient_id == Patient.id)
        .group_by(Patient.id)
        .having(func.count(col(Case.id)) >= min_cases)
        .order_by(func.max(Case.acquired_at).desc())
    )
    if user.role != Role.ADMIN:
        statement = statement.where(Patient.owner_id == user.id)
    if q and q.strip():
        statement = statement.where(func.lower(Patient.pseudonym).like(f"%{q.strip().lower()}%"))
    return [
        PatientSummary(id=p.id, pseudonym=p.pseudonym, case_count=n, last_study_at=as_utc(last) if last else None)
        for p, n, last in session.exec(statement).all()
    ]


@router.post("/compare", response_model=Comparison, tags=["patients"])
def compare_studies(body: CompareRequest, user: CurrentUser, session: SessionDep, llm: LLMDep) -> Comparison:
    """Findings delta between two studies of one patient, with an LLM interval-change summary."""
    try:
        first = get_case(session, body.prior_id, user)
        second = get_case(session, body.current_id, user)
    except CaseNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Case {exc} not found") from None
    try:
        return compare(session, first, second, body.language, llm)
    except ComparisonError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.get(
    "/training/next", response_model=TrainingCase, tags=["training"],
    responses={204: {"description": "No reviewed cases yet"}},
)
def training_next(user: CurrentUser, session: SessionDep, exclude: int | None = None) -> TrainingCase | Response:
    case = training.next_case(session, user, exclude)
    return case if case else Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/training/{case_id}/attempt", response_model=TrainingReveal, tags=["training"])
def training_attempt(case_id: int, body: TrainingAttemptRequest, user: CurrentUser, session: SessionDep) -> TrainingReveal:
    """Submit a blind read; reveals the AI result and the physician-confirmed findings."""
    try:
        return training.attempt(session, user, case_id, body)
    except training.TrainingCaseNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Training case not found") from None


@router.get("/training/stats", response_model=TrainingStats, tags=["training"])
def training_stats(user: CurrentUser, session: SessionDep) -> TrainingStats:
    return training.stats(session, user)


@router.get("/training/ai-mistakes", response_model=list[AIMistake], tags=["training"])
def training_ai_mistakes(_: CurrentUser, session: SessionDep) -> list[AIMistake]:
    """Reviewed cases where the physician overruled the AI: a reminder not to trust it blindly."""
    return training.ai_mistakes(session)


@router.get("/stats/dashboard", response_model=DashboardStats, tags=["stats"])
def dashboard(user: CurrentUser, session: SessionDep, tz_offset: int = Query(0, ge=-840, le=840)) -> DashboardStats:
    return stats.dashboard(session, user, tz_offset)


@router.get("/stats/safety", response_model=SafetyStats, tags=["stats"])
def safety_monitor(_: Admin, session: SessionDep) -> SafetyStats:
    """Post-deployment monitoring across all cases (admin only)."""
    return stats.safety(session)

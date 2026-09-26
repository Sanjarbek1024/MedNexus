import asyncio
import json
import logging
from collections.abc import AsyncIterator, Iterator
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import case as when
from sqlmodel import Session, col, func, select

from app.api.deps import CurrentUser, Doctor, LLMDep, Service, SessionDep, limit
from app.db import audit
from app.db.audit import as_utc
from app.db.models import Case, CaseStatus, ChatMessage, Priority, User
from app.db.session import get_engine
from app.schemas import (
    AnalysisResult,
    AuditVerification,
    CaseList,
    ChatMessageOut,
    ChatRequest,
    ReportRequest,
    ReportSections,
    ReviewRequest,
)
from app.services.analysis import ReviewNotAllowedError
from app.services.assistant import chat_stream
from app.services.cases import CaseNotFoundError, assemble, get_case, search_filter, summaries, user_names, visible

router = APIRouter(tags=["cases"])
logger = logging.getLogger(__name__)

STATUS_GROUPS = {
    "new": [CaseStatus.QUEUED, CaseStatus.ANALYZING],
    "ai_ready": [CaseStatus.AI_READY],
    "reviewed": [CaseStatus.REVIEWED],
    "rejected": [CaseStatus.IMAGE_REJECTED, CaseStatus.FAILED],
    "open": [CaseStatus.QUEUED, CaseStatus.ANALYZING, CaseStatus.AI_READY],
}


def _case(session: Session, case_id: int, user: User) -> Case:
    try:
        return get_case(session, case_id, user)
    except CaseNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Case {case_id} not found") from None


@router.get("/cases", response_model=CaseList)
def list_cases(
    user: CurrentUser,
    session: SessionDep,
    group: Literal["new", "ai_ready", "reviewed", "rejected", "open"] | None = None,
    priority: Priority | None = None,
    modality: str | None = None,
    patient_id: int | None = None,
    q: str | None = Query(None, max_length=80),
    sort: Literal["worklist", "recent"] = "worklist",
    limit_: int = Query(100, alias="limit", ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> CaseList:
    """Worklist order: open cases first, most urgent first, then longest waiting first."""
    statement = visible(select(Case), user)
    if group:
        statement = statement.where(col(Case.status).in_(STATUS_GROUPS[group]))
    if priority:
        statement = statement.where(Case.priority == priority)
    if modality:
        statement = statement.where(Case.modality == modality)
    if patient_id:
        statement = statement.where(Case.patient_id == patient_id)
    if q and q.strip():
        statement = search_filter(statement, q)

    total = session.exec(select(func.count()).select_from(statement.subquery())).one()
    if sort == "worklist":
        open_first = when((col(Case.status).in_(STATUS_GROUPS["open"]), 0), else_=1)
        urgency = when((Case.priority == Priority.URGENT, 0), (Case.priority == Priority.ATTENTION, 1), else_=2)
        statement = statement.order_by(open_first, urgency, Case.created_at)
    else:
        statement = statement.order_by(col(Case.created_at).desc())
    cases = session.exec(statement.offset(offset).limit(limit_)).all()
    return CaseList(items=summaries(session, list(cases)), total=total)


@router.get("/cases/{case_id}", response_model=AnalysisResult)
def get_case_view(case_id: int, user: CurrentUser, session: SessionDep) -> AnalysisResult:
    return assemble(session, _case(session, case_id, user))


@router.post("/cases/{case_id}/review", response_model=AnalysisResult)
def review_case(
    case_id: int, review: ReviewRequest, user: Doctor, session: SessionDep, service: Service
) -> AnalysisResult:
    """Physician sign-off: confirm, edit or reject the AI draft and finalize the structured report."""
    case = _case(session, case_id, user)
    try:
        service.review(session, case, review, user)
    except ReviewNotAllowedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return assemble(session, case)


@router.put("/cases/{case_id}/report/draft", response_model=AnalysisResult)
def save_report_draft(
    case_id: int, body: ReportSections, user: Doctor, session: SessionDep, service: Service
) -> AnalysisResult:
    case = _case(session, case_id, user)
    try:
        service.save_draft(session, case, body, user)
    except ReviewNotAllowedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return assemble(session, case)


@router.post("/cases/{case_id}/report", response_model=AnalysisResult)
async def regenerate_report(
    case_id: int, body: ReportRequest, user: Doctor, session: SessionDep, service: Service
) -> AnalysisResult:
    """Rewrite the AI report in another language, from the stored model outputs."""
    case = _case(session, case_id, user)
    try:
        await asyncio.to_thread(service.regenerate_report, session, case, body.language)
    except ReviewNotAllowedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return assemble(session, case)


@router.post("/cases/{case_id}/assessment", response_model=AnalysisResult)
async def regenerate_assessment(
    case_id: int, body: ReportRequest, user: CurrentUser, session: SessionDep, service: Service
) -> AnalysisResult:
    """Redo the image + symptoms differential, e.g. in another language."""
    case = _case(session, case_id, user)
    try:
        await asyncio.to_thread(service.regenerate_assessment, session, case, body.language)
    except ReviewNotAllowedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return assemble(session, case)


@router.get("/cases/{case_id}/chat", response_model=list[ChatMessageOut])
def chat_history(case_id: int, user: CurrentUser, session: SessionDep) -> list[ChatMessageOut]:
    _case(session, case_id, user)
    return _history(session, case_id)


def _history(session: Session, case_id: int) -> list[ChatMessageOut]:
    messages = session.exec(
        select(ChatMessage).where(ChatMessage.case_id == case_id).order_by(ChatMessage.id)
    ).all()
    names = user_names(session, {m.user_id for m in messages if m.user_id})
    return [
        ChatMessageOut(
            id=m.id, role=m.role, content=m.content, language=m.language,
            author=names.get(m.user_id) if m.user_id else None, created_at=as_utc(m.created_at),
        )
        for m in messages
    ]


@router.post(
    "/cases/{case_id}/chat",
    responses={200: {"content": {"text/event-stream": {}}}},
    dependencies=[Depends(limit("chat", "chat_rate_per_minute"))],
)
async def chat(case_id: int, body: ChatRequest, user: CurrentUser, session: SessionDep, llm: LLMDep) -> StreamingResponse:
    """Ask about this case. Streams ``token`` events, then ``done`` (or ``error``)."""
    case = _case(session, case_id, user)
    if case.status not in (CaseStatus.AI_READY, CaseStatus.REVIEWED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Chat is available once the case has AI findings")
    history = _history(session, case_id)
    result = assemble(session, case, with_audit=False)
    session.add(ChatMessage(case_id=case_id, user_id=user.id, role="user", content=body.message.strip(), language=body.language))
    session.commit()
    audit.record(session, "chat_question", user.full_name, {"language": body.language}, user_id=user.id, case_id=case_id)
    audience = "doctor"
    tokens = chat_stream(llm, result, history, body.message.strip(), body.language, audience)
    return StreamingResponse(
        _stream_answer(tokens, case_id, body.language),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _stream_answer(tokens: Iterator[str], case_id: int, language: str) -> AsyncIterator[str]:
    """Relays LLM tokens from a worker thread; stores the full answer when it completes."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    def emit(message: str | None) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, message)

    def work() -> None:
        parts: list[str] = []
        try:
            for token in tokens:
                parts.append(token)
                emit(_sse("token", {"text": token}))
            with Session(get_engine()) as session:
                message = ChatMessage(case_id=case_id, role="assistant", content="".join(parts), language=language)
                session.add(message)
                session.commit()
                session.refresh(message)
                emit(_sse("done", {"id": message.id}))
        except Exception as exc:
            logger.warning("Chat failed: %s", exc)
            reason = str(exc) if "GROQ_API_KEY" in str(exc) else "the language model is unavailable"
            emit(_sse("error", {"detail": f"The assistant could not answer: {reason}."}))
        finally:
            emit(None)

    worker = loop.run_in_executor(None, work)
    while (message := await queue.get()) is not None:
        yield message
    await worker


@router.get("/audit/verify", response_model=AuditVerification)
def verify_audit_log(_: CurrentUser, session: SessionDep) -> AuditVerification:
    """Recompute the audit log's hash chain to detect edited or deleted events."""
    valid, events, first_invalid = audit.verify(session)
    return AuditVerification(valid=valid, events=events, first_invalid_event=first_invalid)

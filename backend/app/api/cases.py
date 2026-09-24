import asyncio

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import Service
from app.db.store import CaseNotFoundError
from app.languages import LANGUAGES
from app.schemas import (
    AnalysisResult,
    AuditVerification,
    CaseList,
    ReportRequest,
    ReviewRequest,
)
from app.services.analysis import ReviewNotAllowedError

router = APIRouter(tags=["cases"])


def _not_found(case_id: int) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"Case {case_id} not found")


@router.get("/cases", response_model=CaseList)
def list_cases(
    service: Service, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)
) -> CaseList:
    items, total = service.store.list(limit, offset)
    return CaseList(items=items, total=total)


@router.get("/cases/{case_id}", response_model=AnalysisResult)
def get_case(case_id: int, service: Service) -> AnalysisResult:
    try:
        return service.store.load(case_id)
    except CaseNotFoundError:
        raise _not_found(case_id) from None


@router.post("/cases/{case_id}/review", response_model=AnalysisResult)
def review_case(case_id: int, review: ReviewRequest, service: Service) -> AnalysisResult:
    """Record the physician's decision: confirm, reject or edit the AI draft."""
    try:
        return service.review(case_id, review)
    except CaseNotFoundError:
        raise _not_found(case_id) from None
    except ReviewNotAllowedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@router.post("/cases/{case_id}/report", response_model=AnalysisResult)
async def regenerate_report(case_id: int, body: ReportRequest, service: Service) -> AnalysisResult:
    """Rewrite the AI report in another language, from the stored model outputs."""
    if body.language not in LANGUAGES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown language '{body.language}'")
    try:
        return await asyncio.to_thread(service.regenerate_report, case_id, body.language)
    except CaseNotFoundError:
        raise _not_found(case_id) from None
    except ReviewNotAllowedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@router.get("/audit/verify", response_model=AuditVerification)
def verify_audit_log(service: Service) -> AuditVerification:
    """Recompute the audit log's hash chain to detect edited or deleted events."""
    return service.store.verify()

import asyncio
import hmac
import json
import logging
from collections.abc import AsyncIterator, Callable
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError
from sqlmodel import Session, select

from app.analyzers.base import Stage
from app.api.deps import CurrentUser, Queue, Service, SessionDep, limit
from app.config import get_settings
from app.db.models import Case, Patient, User
from app.db.session import get_engine
from app.imaging import ImageDecodeError, decode_upload
from app.languages import DEFAULT_LANGUAGE, LANGUAGES
from app.schemas import AnalysisResult, BatchUploadResult, ClinicalData, ClinicalRules, Selection
from app.services import uploads
from app.services.analysis import ReviewNotAllowedError
from app.services.assessment import PatientContext
from app.services.cases import CaseNotFoundError, assemble, get_case, summaries
from app.services.clinical_rules import evaluate

router = APIRouter(tags=["analysis"])
logger = logging.getLogger(__name__)
MAX_BATCH = 20


def _pseudonym_key() -> str:
    settings = get_settings()
    if settings.pseudonym_key:
        return settings.pseudonym_key
    return hmac.new(settings.signing_key().encode(), b"patient-pseudonyms", "sha256").hexdigest()


def resolve_patient(
    session: Session, user: User, upload: uploads.SanitizedUpload | None, patient_id: int | None
) -> Patient:
    """The chosen patient, the patient linked to this DICOM PatientID, or a new pseudonym."""
    if patient_id is not None:
        patient = session.get(Patient, patient_id)
        if patient is None or patient.owner_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
        return patient
    source_hash = None
    if upload is not None and upload.source_patient_id:
        source_hash = uploads.pseudonym_source_hash(_pseudonym_key(), user.id, upload.source_patient_id)
        existing = session.exec(
            select(Patient).where(Patient.owner_id == user.id, Patient.source_hash == source_hash)
        ).first()
        if existing:
            return existing
    pseudonym = f"PX-{source_hash[:8].upper()}" if source_hash else uploads.random_pseudonym()
    while session.exec(select(Patient).where(Patient.pseudonym == pseudonym)).first():
        pseudonym = uploads.random_pseudonym()
    patient = Patient(pseudonym=pseudonym, source_hash=source_hash, owner_id=user.id)
    session.add(patient)
    session.commit()
    session.refresh(patient)
    return patient


def _validate_selection(service, modality: str, region: str, view: str, language: str) -> Selection:  # noqa: ANN001
    if language not in LANGUAGES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown language '{language}'")
    if not service.supports(modality, region, view):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"{modality} / {region} / {view} is not supported yet"
        )
    return Selection(modality=modality, region=region, view=view, language=language)


async def _read_upload(file: UploadFile) -> tuple[uploads.SanitizedUpload, object]:
    limit_bytes = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit_bytes + 1)
    if len(data) > limit_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "The file is too large")
    try:
        upload = await asyncio.to_thread(uploads.sanitize, data)
        image = await asyncio.to_thread(decode_upload, upload.data, upload.sha256)
    except (uploads.UnsupportedUploadError, ImageDecodeError) as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from exc
    return upload, image


def _clinical(raw: str | None) -> ClinicalData | None:
    if not raw or not raw.strip():
        return None
    try:
        data = ClinicalData.model_validate_json(raw)
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Invalid clinical data: {exc.errors()[0]['msg']}") from exc
    return None if data.is_empty() and not any(data.vitals.model_dump(exclude={"on_oxygen", "consciousness"}).values()) else data


def _context(symptoms: str | None, age: int | None, sex: str | None, clinical: ClinicalData | None = None) -> PatientContext:
    symptoms = (symptoms or "").strip()[:2000] or None
    if age is not None and not 0 <= age <= 120:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Age must be between 0 and 120")
    if sex not in (None, "", "male", "female"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Sex must be 'male' or 'female'")
    return PatientContext(symptoms, age, sex or None, clinical=clinical.model_dump() if clinical else None)


def _acquired(value: date | None) -> datetime | None:
    return datetime.combine(value, time(12), tzinfo=timezone.utc) if value else None


@router.post(
    "/analyze",
    response_model=AnalysisResult,
    responses={200: {"content": {"text/event-stream": {}}}},
    dependencies=[Depends(limit("analysis", "analysis_rate_per_minute"))],
)
async def analyze(
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    service: Service,
    file: UploadFile | None = File(None, description="Optional DICOM, PNG or JPEG"),
    modality: str | None = Form(None),
    region: str | None = Form(None),
    view: str | None = Form(None),
    language: str = Form(DEFAULT_LANGUAGE),
    patient_id: int | None = Form(None),
    acquired_on: date | None = Form(None),
    symptoms: str | None = Form(None, max_length=2000, description="History of present illness"),
    age: int | None = Form(None),
    sex: str | None = Form(None, description="male | female"),
    clinical: str | None = Form(None, max_length=20000, description="ClinicalData as JSON"),
) -> AnalysisResult | StreamingResponse:
    """Create a case from the clinical intake, optionally with one image, and analyze it.

    Without an image the differential comes from the intake alone (rules engine → clinical
    reasoner → safety critic). Send ``Accept: text/event-stream`` to receive ``progress`` events
    followed by a final ``result`` event.
    """
    intake = _clinical(clinical)
    context = _context(symptoms, age, sex, intake)
    if file is None or not file.filename:
        if language not in LANGUAGES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown language '{language}'")
        if intake is None and not context.symptoms:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter the complaint or symptoms, or upload an image")
        patient = resolve_patient(session, user, None, patient_id)
        case = service.create_clinical_case(session, user, patient, language, context)
    else:
        if not (modality and region and view):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose the study type for the image")
        selection = _validate_selection(service, modality, region, view, language)
        upload, image = await _read_upload(file)
        patient = resolve_patient(session, user, upload, patient_id)
        case = service.create_case(session, user, upload, image, selection, patient, _acquired(acquired_on), context)
    response = _respond(request, service, case.id)
    return await response if asyncio.iscoroutine(response) else response


@router.post(
    "/cases/{case_id}/imaging",
    response_model=AnalysisResult,
    responses={200: {"content": {"text/event-stream": {}}}},
    dependencies=[Depends(limit("analysis", "analysis_rate_per_minute"))],
)
async def attach_imaging(
    case_id: int,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    service: Service,
    file: UploadFile = File(description="DICOM, PNG or JPEG"),
    modality: str = Form(),
    region: str = Form(),
    view: str = Form(),
) -> AnalysisResult | StreamingResponse:
    """Add an image to a clinical case; the differential is rebuilt with the image."""
    try:
        case = get_case(session, case_id, user)
    except CaseNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found") from exc
    selection = _validate_selection(service, modality, region, view, case.language)
    upload, image = await _read_upload(file)
    try:
        service.attach_image(session, case, user, upload, image, selection)
    except ReviewNotAllowedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    response = _respond(request, service, case_id)
    return await response if asyncio.iscoroutine(response) else response


def _respond(request: Request, service, case_id: int):  # noqa: ANN001, ANN202 - a stream or an awaitable result

    def run(progress: Callable[[Stage], None]) -> AnalysisResult:
        service.run(case_id, progress)
        with Session(get_engine()) as fresh:
            return assemble(fresh, fresh.get(Case, case_id))

    if "text/event-stream" in request.headers.get("accept", ""):
        return StreamingResponse(
            _events(run),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return asyncio.to_thread(run, lambda stage: None)


@router.post(
    "/cases/batch",
    response_model=BatchUploadResult,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(limit("analysis", "analysis_rate_per_minute"))],
)
async def batch_upload(
    user: CurrentUser,
    session: SessionDep,
    service: Service,
    queue: Queue,
    files: list[UploadFile] = File(description=f"Up to {MAX_BATCH} DICOM, PNG or JPEG files"),
    modality: str = Form(),
    region: str = Form(),
    view: str = Form(),
    language: str = Form(DEFAULT_LANGUAGE),
    patient_id: int | None = Form(None),
) -> BatchUploadResult:
    """Queue several studies; they are analyzed in the background and appear in the worklist."""
    if len(files) > MAX_BATCH:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"At most {MAX_BATCH} files per batch")
    selection = _validate_selection(service, modality, region, view, language)
    queued, rejected = [], []
    for file in files:
        try:
            upload, image = await _read_upload(file)
        except HTTPException as exc:
            rejected.append({"file": file.filename or "upload", "reason": str(exc.detail)})
            continue
        patient = resolve_patient(session, user, upload, patient_id)
        case = service.create_case(session, user, upload, image, selection, patient, None)
        queued.append(case)
        queue.submit(case.id)
    return BatchUploadResult(queued=summaries(session, queued), rejected=rejected)


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


async def _events(run: Callable[[Callable[[Stage], None]], AnalysisResult]) -> AsyncIterator[str]:
    """Runs the analysis in a worker thread and streams its progress as server-sent events."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    def emit(message: str | None) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, message)

    def work() -> None:
        try:
            result = run(lambda stage: emit(_sse("progress", json.dumps({"stage": stage}))))
            emit(_sse("result", result.model_dump_json()))
        except Exception:
            logger.exception("Analysis failed")
            emit(_sse("error", json.dumps({"detail": "The analysis failed unexpectedly."})))
        finally:
            emit(None)

    worker = loop.run_in_executor(None, work)
    while (message := await queue.get()) is not None:
        yield message
    await worker


class RulesPreview(BaseModel):
    clinical: ClinicalData
    age: int | None = Field(default=None, ge=0, le=120)


@router.post("/clinical/evaluate", response_model=ClinicalRules, tags=["clinical"])
def evaluate_rules(body: RulesPreview, _: CurrentUser) -> ClinicalRules:
    """Live triage preview while the intake is being filled in: the deterministic rules only."""
    return evaluate(body.clinical, body.age)

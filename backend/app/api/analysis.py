import asyncio
import json
import logging
from collections.abc import AsyncIterator, Callable

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from app.analyzers.base import Stage
from app.api.deps import Service
from app.config import get_settings
from app.imaging import ImageDecodeError, decode_upload
from app.languages import DEFAULT_LANGUAGE, LANGUAGES
from app.schemas import AnalysisResult, Selection

router = APIRouter(tags=["analysis"])
logger = logging.getLogger(__name__)


@router.post(
    "/analyze",
    response_model=AnalysisResult,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def analyze(
    request: Request,
    service: Service,
    file: UploadFile = File(description="DICOM, PNG or JPEG"),
    modality: str = Form(),
    region: str = Form(),
    view: str = Form(),
    language: str = Form(DEFAULT_LANGUAGE),
) -> AnalysisResult | StreamingResponse:
    """Run every analyzer registered for the study type and draft a report.

    Send ``Accept: text/event-stream`` to receive ``progress`` events (quality, models,
    explainability, report) followed by a final ``result`` event.
    """
    if language not in LANGUAGES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown language '{language}'")
    if not service.supports(modality, region, view):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"{modality} / {region} / {view} is not supported yet",
        )
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "The file is too large")
    try:
        image = await asyncio.to_thread(decode_upload, data, file.filename)
    except ImageDecodeError as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from exc

    selection = Selection(modality=modality, region=region, view=view, language=language)
    if "text/event-stream" in request.headers.get("accept", ""):
        stream = _events(lambda progress: service.analyze(image, selection, progress))
        return StreamingResponse(
            stream,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return await asyncio.to_thread(service.analyze, image, selection, lambda stage: None)


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


async def _events(
    run: Callable[[Callable[[Stage], None]], AnalysisResult],
) -> AsyncIterator[str]:
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

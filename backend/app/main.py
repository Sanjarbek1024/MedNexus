"""FastAPI application. Migrations run and all models load once, at startup."""

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import __version__
from app.analyzers.registry import AnalyzerRegistry
from app.api import router
from app.config import get_settings
from app.db.session import run_migrations
from app.security import CSRF_HEADER, SecurityHeadersMiddleware
from app.services.analysis import AnalysisService
from app.services.jobs import AnalysisQueue
from app.services.llm import LLM
from app.services.pipeline import AnalysisPipeline
from app.services.reporting import ReportWriter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("mednexus")


def select_device(preference: str) -> torch.device:
    if preference == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(preference)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    await asyncio.to_thread(run_migrations)
    registry = AnalyzerRegistry.from_yaml(settings.registry_path)
    device = select_device(settings.device)

    started = time.perf_counter()
    await asyncio.to_thread(registry.load, device)
    logger.info(
        "Loaded %d analyzers on %s in %.1fs", len(registry.analyzers), device, time.perf_counter() - started
    )

    llm = LLM(settings.groq_api_key, settings.groq_model, settings.groq_timeout_s, max_retries=3)
    # Retries wait out per-minute token limits (the client honours Retry-After).
    vision = LLM(settings.groq_api_key, settings.groq_vision_model, settings.groq_vision_timeout_s, max_retries=3)
    service = AnalysisService(AnalysisPipeline(registry), ReportWriter(llm), settings, vision)
    queue = AnalysisQueue(service)
    queue.start()

    app.state.registry = registry
    app.state.device = device
    app.state.llm = llm
    app.state.service = service
    app.state.queue = queue
    yield
    await asyncio.to_thread(queue.stop)


# The web app's policy (same as frontend/nginx.conf): inline styles are used by the UI library.
SPA_CSP = (
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; "
    "connect-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
    "frame-ancestors 'none'"
)


def mount_web_app(app: FastAPI, directory: Path) -> None:
    """Serve the built single-page app: real files as they are, every other page as index.html."""
    root = directory.resolve()
    index = root / "index.html"
    if not index.is_file():
        logger.warning("STATIC_DIR %s has no index.html; the web app is not served", root)
        return
    headers = {"Content-Security-Policy": SPA_CSP}

    @app.get("/{path:path}", include_in_schema=False)
    async def web_app(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not Found")
        file = (root / path).resolve()
        if path and file.is_file() and root in file.parents:  # never outside the build folder
            return FileResponse(file, headers=headers)
        return FileResponse(index, headers={**headers, "Cache-Control": "no-cache"})


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MedNexus API",
        version=__version__,
        description=(
            "AI decision support for medical image review. Research prototype, "
            "not a certified medical device. All AI findings require physician confirmation."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Accept", CSRF_HEADER],
    )
    app.include_router(router)
    if settings.static_dir:
        mount_web_app(app, settings.static_dir)
    return app


app = create_app()

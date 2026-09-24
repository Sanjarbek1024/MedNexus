"""FastAPI application. All models are loaded once, at startup."""

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.analyzers.registry import AnalyzerRegistry
from app.api import router
from app.config import get_settings
from app.db.store import CaseStore
from app.services.analysis import AnalysisService
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
    registry = AnalyzerRegistry.from_yaml(settings.registry_path)
    device = select_device(settings.device)

    started = time.perf_counter()
    await asyncio.to_thread(registry.load, device)
    logger.info(
        "Loaded %d analyzers on %s in %.1fs",
        len(registry.analyzers),
        device,
        time.perf_counter() - started,
    )

    app.state.registry = registry
    app.state.device = device
    app.state.service = AnalysisService(
        AnalysisPipeline(registry),
        ReportWriter(settings.groq_api_key, settings.groq_model, settings.groq_timeout_s),
        CaseStore(settings.data_dir),
    )
    yield


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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()

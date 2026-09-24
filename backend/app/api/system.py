from fastapi import APIRouter

from app import __version__
from app.api.deps import Device, Registry
from app.config import get_settings
from app.schemas import AnalyzerStatus, Capabilities, Health, LLMStatus

router = APIRouter(tags=["system"])


@router.get("/health", response_model=Health)
def health(registry: Registry, device: Device) -> Health:
    settings = get_settings()
    return Health(
        version=__version__,
        device=str(device),
        analyzers=[
            AnalyzerStatus(id=a.id, label=a.label, versions=a.versions) for a in registry.analyzers
        ],
        llm=LLMStatus(model=settings.groq_model, configured=bool(settings.groq_api_key)),
    )


@router.get("/capabilities", response_model=Capabilities)
def capabilities(registry: Registry) -> Capabilities:
    """Every modality / region / view, with which combinations are currently supported."""
    return registry.capabilities()

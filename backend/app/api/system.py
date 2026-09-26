from fastapi import APIRouter

from app import __version__
from app.api.deps import Device, LLMDep, Registry, Service
from app.db.session import get_engine
from app.schemas import AnalyzerStatus, Capabilities, Health, LLMStatus

router = APIRouter(tags=["system"])


@router.get("/health", response_model=Health)
def health(registry: Registry, device: Device, llm: LLMDep, service: Service) -> Health:
    vision = service.vision
    return Health(
        version=__version__,
        device=str(device),
        database=get_engine().dialect.name,
        analyzers=[
            AnalyzerStatus(id=a.id, label=a.label, versions=a.versions) for a in registry.analyzers
        ],
        llm=LLMStatus(model=llm.model, configured=llm.configured),
        vision=LLMStatus(model=vision.model, configured=vision.configured) if vision else None,
    )


@router.get("/capabilities", response_model=Capabilities)
def capabilities(registry: Registry) -> Capabilities:
    """Every modality / region / view, with which combinations are currently supported."""
    return registry.capabilities()

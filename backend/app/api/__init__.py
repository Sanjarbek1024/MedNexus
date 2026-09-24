from fastapi import APIRouter

from app.api import analysis, cases, system

router = APIRouter(prefix="/api")
router.include_router(system.router)
router.include_router(analysis.router)
router.include_router(cases.router)

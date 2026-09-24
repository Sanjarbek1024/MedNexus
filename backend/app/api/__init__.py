from fastapi import APIRouter

from app.api import system

router = APIRouter(prefix="/api")
router.include_router(system.router)

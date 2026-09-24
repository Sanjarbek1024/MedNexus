from fastapi import APIRouter, Depends

from app.api import analysis, auth, cases, system, users, workspace
from app.api.deps import verify_csrf

router = APIRouter(prefix="/api", dependencies=[Depends(verify_csrf)])
for module in (system, auth, users, analysis, cases, workspace):
    router.include_router(module.router)

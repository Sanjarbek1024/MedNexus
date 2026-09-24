"""Request dependencies: database session, authenticated user, roles, CSRF and rate limits."""

import secrets
from collections.abc import Callable
from typing import Annotated

import torch
from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from app.analyzers.registry import AnalyzerRegistry
from app.config import get_settings
from app.db.models import Role, User
from app.db.session import get_session
from app.security import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, decode_token, rate_limiter
from app.services.analysis import AnalysisService
from app.services.jobs import AnalysisQueue
from app.services.llm import LLM

CSRF_EXEMPT = {"/api/auth/login", "/api/auth/register"}
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def verify_csrf(request: Request) -> None:
    """Double-submit check: the X-CSRF-Token header must echo the (script-readable) CSRF cookie.

    A cross-site page can make the browser send cookies, but cannot read them to set the header.
    """
    if request.method not in UNSAFE_METHODS or request.url.path in CSRF_EXEMPT:
        return
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not header or not secrets.compare_digest(cookie, header):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF token missing or invalid")


SessionDep = Annotated[Session, Depends(get_session)]


def current_user(request: Request, session: SessionDep) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    claims = decode_token(token, "access") if token else None
    user = session.get(User, int(claims["sub"])) if claims else None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_roles(*roles: Role) -> Callable[[User], User]:
    def check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role does not allow this action")
        return user

    return check


Admin = Annotated[User, Depends(require_roles(Role.ADMIN))]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def limit(bucket: str, setting: str) -> Callable[..., None]:
    """Rate-limit a route per signed-in user (or per IP for anonymous routes)."""

    def check(request: Request) -> None:
        user_token = request.cookies.get(ACCESS_COOKIE)
        claims = decode_token(user_token, "access") if user_token else None
        key = f"user:{claims['sub']}" if claims else f"ip:{client_ip(request)}"
        wait = rate_limiter.hit(bucket, key, getattr(get_settings(), setting))
        if wait is not None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests. Please wait a moment.",
                headers={"Retry-After": str(max(1, int(wait)))},
            )

    return check


def _registry(request: Request) -> AnalyzerRegistry:
    return request.app.state.registry


def _device(request: Request) -> torch.device:
    return request.app.state.device


def _service(request: Request) -> AnalysisService:
    return request.app.state.service


def _queue(request: Request) -> AnalysisQueue:
    return request.app.state.queue


def _llm(request: Request) -> LLM:
    return request.app.state.llm


Registry = Annotated[AnalyzerRegistry, Depends(_registry)]
Device = Annotated[torch.device, Depends(_device)]
Service = Annotated[AnalysisService, Depends(_service)]
Queue = Annotated[AnalysisQueue, Depends(_queue)]
LLMDep = Annotated[LLM, Depends(_llm)]

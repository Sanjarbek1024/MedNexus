"""Password hashing, session tokens, CSRF, rate limiting and security headers."""

from __future__ import annotations

import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings

ACCESS_COOKIE = "mnx_access"
REFRESH_COOKIE = "mnx_refresh"
CSRF_COOKIE = "mnx_csrf"
CSRF_HEADER = "x-csrf-token"
_ALGORITHM = "HS256"
_hasher = PasswordHasher()  # argon2id with the library's recommended parameters

PASSWORD_RULES = "at least 10 characters, including a letter and a digit"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_is_strong(password: str) -> bool:
    return (
        10 <= len(password) <= 128
        and re.search(r"[A-Za-z]", password) is not None
        and re.search(r"\d", password) is not None
    )


# A valid hash to verify against when the email is unknown, so response time does not
# reveal whether an account exists.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def _encode(claims: dict, lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {**claims, "iat": now, "exp": now + lifetime, "jti": secrets.token_hex(8)}
    return jwt.encode(payload, get_settings().signing_key(), algorithm=_ALGORITHM)


def access_token(user_id: int, role: str) -> str:
    minutes = get_settings().access_token_minutes
    return _encode({"sub": str(user_id), "role": role, "typ": "access"}, timedelta(minutes=minutes))


def refresh_token(user_id: int, token_version: int) -> str:
    days = get_settings().refresh_token_days
    return _encode({"sub": str(user_id), "ver": token_version, "typ": "refresh"}, timedelta(days=days))


def decode_token(token: str, kind: str) -> dict | None:
    try:
        claims = jwt.decode(token, get_settings().signing_key(), algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return claims if claims.get("typ") == kind else None


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


class RateLimiter:
    """In-memory sliding-window limiter (one API process; use a shared store when scaling out)."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, bucket: str, key: str, limit: int, window_s: float = 60.0) -> float | None:
        """Record a request. Returns seconds to wait if the limit is exceeded, else None."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[(bucket, key)]
            while hits and now - hits[0] > window_s:
                hits.popleft()
            if len(hits) >= limit:
                return window_s - (now - hits[0])
            hits.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


rate_limiter = RateLimiter()

_API_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cache-control", b"no-store"),
]
_API_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")


class SecurityHeadersMiddleware:
    """Adds security headers to every response (a CSP to everything except the API docs)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]
        is_docs = path.startswith(("/docs", "/redoc", "/openapi.json"))

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                existing = {name for name, _ in headers}
                extra = _API_HEADERS if is_docs else [*_API_HEADERS, _API_CSP]
                headers.extend(h for h in extra if h[0] not in existing)
                if scope.get("scheme") == "https":
                    headers.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)

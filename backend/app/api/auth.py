from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, client_ip, limit
from app.config import get_settings
from app.db import audit
from app.db.audit import as_utc
from app.db.models import User, utcnow
from app.schemas import LoginRequest, PasswordChange, ProfileUpdate, RegisterRequest, UserOut
from app.security import (
    ACCESS_COOKIE,
    CSRF_COOKIE,
    DUMMY_HASH,
    PASSWORD_RULES,
    REFRESH_COOKIE,
    access_token,
    decode_token,
    hash_password,
    new_csrf_token,
    password_is_strong,
    refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
INVALID_CREDENTIALS = "Invalid email or password"


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role,
        language=user.language, created_at=as_utc(user.created_at),
    )


def start_session(response: Response, user: User) -> None:
    settings = get_settings()
    common = {"secure": settings.cookie_secure, "samesite": "strict"}
    refresh_age = settings.refresh_token_days * 86400
    response.set_cookie(
        ACCESS_COOKIE, access_token(user.id, user.role), max_age=settings.access_token_minutes * 60,
        httponly=True, path="/api", **common,
    )
    response.set_cookie(
        REFRESH_COOKIE, refresh_token(user.id, user.token_version), max_age=refresh_age,
        httponly=True, path="/api/auth", **common,
    )
    response.set_cookie(CSRF_COOKIE, new_csrf_token(), max_age=refresh_age, httponly=False, path="/", **common)


def end_session(response: Response) -> None:
    for name, path in ((ACCESS_COOKIE, "/api"), (REFRESH_COOKIE, "/api/auth"), (CSRF_COOKIE, "/")):
        response.delete_cookie(name, path=path)


@router.post(
    "/register", response_model=UserOut, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limit("login", "login_rate_per_minute"))],
)
def register(body: RegisterRequest, response: Response, session: SessionDep) -> UserOut:
    """Create a Radiologist or Resident account. Admins are created by other admins or the seed."""
    if not password_is_strong(body.password):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Password needs {PASSWORD_RULES}")
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(
        email=body.email, full_name=body.full_name.strip(), role=body.role, language=body.language,
        password_hash=hash_password(body.password), last_login_at=utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    audit.record(session, "user_registered", user.full_name, {"role": user.role}, user_id=user.id)
    start_session(response, user)
    return user_out(user)


@router.post("/login", response_model=UserOut, dependencies=[Depends(limit("login", "login_rate_per_minute"))])
def login(body: LoginRequest, request: Request, response: Response, session: SessionDep) -> UserOut:
    settings = get_settings()
    user = session.exec(select(User).where(User.email == body.email.strip().lower())).first()
    if user is None or not user.is_active:
        verify_password(DUMMY_HASH, body.password)  # same timing as a real check
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_CREDENTIALS)

    now = utcnow()
    if user.locked_until and as_utc(user.locked_until) > now:
        minutes = max(1, round((as_utc(user.locked_until) - now).total_seconds() / 60))
        raise HTTPException(
            status.HTTP_423_LOCKED, f"Too many failed attempts. Try again in {minutes} min."
        )
    if not verify_password(user.password_hash, body.password):
        user.failed_logins += 1
        locked = user.failed_logins >= settings.max_failed_logins
        if locked:
            user.locked_until = now + timedelta(minutes=settings.lockout_minutes)
            user.failed_logins = 0
        session.add(user)
        session.commit()
        audit.record(
            session, "login_locked" if locked else "login_failed", user.full_name,
            {"ip": client_ip(request)}, user_id=user.id,
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_CREDENTIALS)

    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now
    session.add(user)
    session.commit()
    audit.record(session, "login", user.full_name, {"ip": client_ip(request)}, user_id=user.id)
    start_session(response, user)
    return user_out(user)


@router.post("/refresh", response_model=UserOut)
def refresh(request: Request, response: Response, session: SessionDep) -> UserOut:
    token = request.cookies.get(REFRESH_COOKIE)
    claims = decode_token(token, "refresh") if token else None
    user = session.get(User, int(claims["sub"])) if claims else None
    if user is None or not user.is_active or claims["ver"] != user.token_version:
        end_session(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    start_session(response, user)
    return user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, session: SessionDep) -> None:
    """Sign out and revoke every refresh token of this account."""
    token = request.cookies.get(REFRESH_COOKIE)
    claims = decode_token(token, "refresh") if token else None
    user = session.get(User, int(claims["sub"])) if claims else None
    if user is not None:
        user.token_version += 1
        session.add(user)
        session.commit()
        audit.record(session, "logout", user.full_name, {}, user_id=user.id)
    end_session(response)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_profile(body: ProfileUpdate, user: CurrentUser, session: SessionDep) -> UserOut:
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.language is not None:
        user.language = body.language
    session.add(user)
    session.commit()
    return user_out(user)


@router.post("/change-password", response_model=UserOut)
def change_password(body: PasswordChange, response: Response, user: CurrentUser, session: SessionDep) -> UserOut:
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The current password is incorrect")
    if not password_is_strong(body.new_password):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Password needs {PASSWORD_RULES}")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # signs out every other session
    session.add(user)
    session.commit()
    audit.record(session, "password_changed", user.full_name, {}, user_id=user.id)
    start_session(response, user)
    return user_out(user)

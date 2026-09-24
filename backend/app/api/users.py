from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.api.deps import Admin, SessionDep
from app.db import audit
from app.db.audit import as_utc
from app.db.models import User, utcnow
from app.schemas import AdminUserOut, AdminUserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role, language=user.language,
        created_at=as_utc(user.created_at), is_active=user.is_active,
        locked=bool(user.locked_until and as_utc(user.locked_until) > utcnow()),
        last_login_at=as_utc(user.last_login_at) if user.last_login_at else None,
    )


@router.get("", response_model=list[AdminUserOut])
def list_users(_: Admin, session: SessionDep) -> list[AdminUserOut]:
    return [_out(u) for u in session.exec(select(User).order_by(col(User.id))).all()]


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, body: AdminUserUpdate, admin: Admin, session: SessionDep) -> AdminUserOut:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id and (body.role not in (None, admin.role) or body.is_active is False):
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot demote or deactivate yourself")
    changes: dict = {}
    if body.role is not None and body.role != user.role:
        changes["role"] = [user.role, body.role]
        user.role = body.role
        user.token_version += 1
    if body.is_active is not None and body.is_active != user.is_active:
        changes["is_active"] = body.is_active
        user.is_active = body.is_active
        user.token_version += 1
    if body.unlock:
        changes["unlocked"] = True
        user.locked_until, user.failed_logins = None, 0
    session.add(user)
    session.commit()
    if changes:
        audit.record(session, "user_updated", admin.full_name, {"user": user.email, **changes}, user_id=admin.id)
    return _out(user)

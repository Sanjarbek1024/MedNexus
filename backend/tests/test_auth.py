import secrets
from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient

from app.db.models import Role
from app.main import app
from app.security import ACCESS_COOKIE, CSRF_COOKIE
from tests.conftest import PASSWORD, sign_in, upload


def register(client: TestClient, **overrides) -> tuple[str, object]:
    email = f"new-{secrets.token_hex(4)}@example.org"
    body = {"email": email, "full_name": "Dr. New", "password": PASSWORD, "role": "resident"} | overrides
    return email, client.post("/api/auth/register", json=body)


def test_register_signs_in_with_secure_cookies(app_client: TestClient) -> None:
    client = TestClient(app)
    _, response = register(client)
    assert response.status_code == 201
    assert response.json()["role"] == "resident"
    cookies = response.headers.get_list("set-cookie")
    access = next(c for c in cookies if c.startswith(ACCESS_COOKIE))
    assert "HttpOnly" in access and "SameSite=strict" in access and "Path=/api" in access
    assert not any("HttpOnly" in c for c in cookies if c.startswith(CSRF_COOKIE))
    assert client.get("/api/auth/me").status_code == 200


def test_passwords_are_hashed_with_argon2(app_client: TestClient) -> None:
    from sqlmodel import Session, select

    from app.db.models import User
    from app.db.session import get_engine

    email, _ = register(TestClient(app))
    with Session(get_engine()) as session:
        user = session.exec(select(User).where(User.email == email)).one()
    assert user.password_hash.startswith("$argon2id$") and PASSWORD not in user.password_hash


def test_weak_password_and_admin_self_signup_are_refused(app_client: TestClient) -> None:
    assert register(TestClient(app), password="short1")[1].status_code == 422
    assert register(TestClient(app), password="onlyletterslong")[1].status_code == 422
    assert register(TestClient(app), role="admin")[1].status_code == 422


def test_duplicate_email_is_refused(app_client: TestClient) -> None:
    email, _ = register(TestClient(app))
    assert register(TestClient(app), email=email)[1].status_code == 409


def test_login_failure_does_not_reveal_whether_the_account_exists(app_client: TestClient) -> None:
    email, _ = register(TestClient(app))
    wrong = TestClient(app).post("/api/auth/login", json={"email": email, "password": "Wrong-password-1"})
    missing = TestClient(app).post("/api/auth/login", json={"email": "nobody@example.org", "password": PASSWORD})
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json()


def test_account_locks_after_repeated_failures(app_client: TestClient) -> None:
    email, _ = register(TestClient(app))
    anonymous = TestClient(app)
    for _ in range(5):
        assert anonymous.post("/api/auth/login", json={"email": email, "password": "Wrong-password-1"}).status_code == 401
    locked = anonymous.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert locked.status_code == 423


def test_login_is_rate_limited(app_client: TestClient) -> None:
    anonymous = TestClient(app)
    codes = [
        anonymous.post("/api/auth/login", json={"email": f"x{i}@example.org", "password": "Wrong-password-1"}).status_code
        for i in range(12)
    ]
    assert codes[-1] == 429 and 401 in codes


def test_refresh_rotates_and_logout_revokes(app_client: TestClient) -> None:
    email, _ = register(TestClient(app))
    client = sign_in(email)
    assert client.post("/api/auth/refresh").status_code == 200
    client.headers["x-csrf-token"] = client.cookies[CSRF_COOKIE]
    stale_refresh = client.cookies.get("mnx_refresh")
    assert client.post("/api/auth/logout").status_code == 204
    replay = TestClient(app, cookies={"mnx_refresh": stale_refresh, CSRF_COOKIE: "t"}, headers={"x-csrf-token": "t"})
    assert replay.post("/api/auth/refresh").status_code == 401


def test_change_password_requires_the_current_one(app_client: TestClient) -> None:
    email, _ = register(TestClient(app))
    client = sign_in(email)
    bad = client.post("/api/auth/change-password", json={"current_password": "nope-nope-1", "new_password": "Another-pass-99"})
    assert bad.status_code == 400
    good = client.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "Another-pass-99"})
    assert good.status_code == 200
    assert sign_in(email, "Another-pass-99").get("/api/auth/me").json()["email"] == email


def test_profile_update(client: TestClient) -> None:
    body = client.patch("/api/auth/me", json={"language": "ru"}).json()
    assert body["language"] == "ru"


def test_state_changing_requests_need_the_csrf_header(client: TestClient) -> None:
    token = client.headers.pop("x-csrf-token")
    try:
        assert client.patch("/api/auth/me", json={"language": "en"}).status_code == 403
    finally:
        client.headers["x-csrf-token"] = token
    assert client.patch("/api/auth/me", json={"language": "en"}).status_code == 200


def test_users_only_see_their_own_cases(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    owner, stranger, admin = make_user(Role.RADIOLOGIST), make_user(Role.RADIOLOGIST), make_user(Role.ADMIN)
    case_id = upload(owner, sample("chest_pa_normal.jpg")).json()["case_id"]

    assert stranger.get(f"/api/cases/{case_id}").status_code == 404
    assert case_id not in [c["id"] for c in stranger.get("/api/cases").json()["items"]]
    assert stranger.post(f"/api/cases/{case_id}/review", json={"action": "confirm"}).status_code == 404
    assert admin.get(f"/api/cases/{case_id}").status_code == 200
    assert case_id in [c["id"] for c in admin.get("/api/cases").json()["items"]]


def test_residents_cannot_sign_off(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    resident = make_user(Role.RESIDENT)
    case_id = upload(resident, sample("chest_pa_pneumonia.jpg")).json()["case_id"]
    draft = resident.put(f"/api/cases/{case_id}/report/draft", json={"impression": "Right upper lobe consolidation."})
    assert draft.status_code == 200 and draft.json()["physician_report"]["status"] == "draft"
    assert resident.post(f"/api/cases/{case_id}/review", json={"action": "confirm"}).status_code == 403


def test_admin_endpoints_need_the_admin_role(make_user: Callable[[str], TestClient]) -> None:
    radiologist, admin = make_user(Role.RADIOLOGIST), make_user(Role.ADMIN)
    assert radiologist.get("/api/users").status_code == 403
    assert radiologist.get("/api/stats/safety").status_code == 403
    assert any(u["role"] == "admin" for u in admin.get("/api/users").json())
    target = radiologist.get("/api/auth/me").json()["id"]
    updated = admin.patch(f"/api/users/{target}", json={"role": "resident"})
    assert updated.status_code == 200 and updated.json()["role"] == "resident"
    assert radiologist.get("/api/auth/me").json()["role"] == "resident"  # effective immediately

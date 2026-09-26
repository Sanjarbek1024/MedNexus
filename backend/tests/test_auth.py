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
    body = {"email": email, "full_name": "New Person", "password": PASSWORD} | overrides
    return email, client.post("/api/auth/register", json=body)


def test_register_signs_in_with_secure_cookies(app_client: TestClient) -> None:
    client = TestClient(app)
    _, response = register(client)
    assert response.status_code == 201
    assert response.json()["role"] == "user"  # people sign up as users unless they choose "doctor"
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


def test_doctors_can_sign_up(app_client: TestClient) -> None:
    _, response = register(TestClient(app), role="doctor")
    assert response.status_code == 201 and response.json()["role"] == "doctor"


def test_weak_password_and_unknown_roles_are_refused(app_client: TestClient) -> None:
    assert register(TestClient(app), password="short1")[1].status_code == 422
    assert register(TestClient(app), password="onlyletterslong")[1].status_code == 422
    for role in ("admin", "radiologist", "resident"):
        assert register(TestClient(app), role=role)[1].status_code == 422


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
    refused = replay.post("/api/auth/refresh")
    assert refused.status_code == 401
    # The dead session's cookies are cleared, so the browser stops retrying it on every load.
    cleared = refused.headers.get_list("set-cookie")
    assert any(c.startswith(f"{CSRF_COOKIE}=") and "Max-Age=0" in c for c in cleared)
    assert any(c.startswith("mnx_refresh=") and "Max-Age=0" in c for c in cleared)


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
    owner, stranger, person = make_user(Role.DOCTOR), make_user(Role.DOCTOR), make_user(Role.USER)
    case_id = upload(owner, sample("chest_pa_normal.jpg")).json()["case_id"]

    for other in (stranger, person):
        assert other.get(f"/api/cases/{case_id}").status_code == 404
        assert case_id not in [c["id"] for c in other.get("/api/cases").json()["items"]]
    assert stranger.post(f"/api/cases/{case_id}/review", json={"action": "confirm"}).status_code == 404
    assert case_id in [c["id"] for c in owner.get("/api/cases").json()["items"]]


def test_users_read_their_results_but_cannot_sign(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    person = make_user(Role.USER)
    response = upload(person, sample("chest_pa_pneumonia.jpg"), symptoms="Cough and fever for 3 days", age="54", sex="male")
    body = response.json()
    assert response.status_code == 200 and body["status"] == "ai_ready"
    assert (body["symptoms"], body["patient_age"], body["patient_sex"]) == ("Cough and fever for 3 days", 54, "male")
    assert body["hospitals"] and body["hospitals"][0]["partner"]  # partner hospitals are recommended first
    case_id = body["case_id"]
    assert person.get(f"/api/cases/{case_id}").status_code == 200
    assert case_id in [c["id"] for c in person.get("/api/cases").json()["items"]]
    assert person.put(f"/api/cases/{case_id}/report/draft", json={"impression": "x"}).status_code == 403
    assert person.post(f"/api/cases/{case_id}/review", json={"action": "confirm"}).status_code == 403
    assert person.post(f"/api/cases/{case_id}/report", json={"language": "en"}).status_code == 403


def test_doctor_workspace_needs_the_doctor_role(make_user: Callable[[str], TestClient]) -> None:
    person, doctor = make_user(Role.USER), make_user(Role.DOCTOR)
    doctor_only = ["/api/stats/safety", "/api/stats/dashboard", "/api/training/stats", "/api/patients"]
    for path in doctor_only:
        assert person.get(path).status_code == 403, path
        assert doctor.get(path).status_code == 200, path
    assert person.post("/api/compare", json={"prior_id": 1, "current_id": 2}).status_code == 403
    assert doctor.get("/api/users").status_code == 404  # no admin API any more


def test_invalid_patient_context_is_refused(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    person = make_user(Role.USER)
    assert upload(person, sample("chest_pa_normal.jpg"), age="130").status_code == 422
    assert upload(person, sample("chest_pa_normal.jpg"), sex="other").status_code == 422

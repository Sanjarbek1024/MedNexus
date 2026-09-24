import os
import secrets
import tempfile
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

# Isolated test runs: a throwaway database, no real LLM calls, cookies over plain http.
os.environ.update(
    DATA_DIR=tempfile.mkdtemp(prefix="mednexus-test-"),
    GROQ_API_KEY="",
    COOKIE_SECURE="false",
    SECRET_KEY="test-secret-key-" + secrets.token_hex(8),
)
# Set MEDNEXUS_TEST_DATABASE_URL to run the suite against an (empty) PostgreSQL database.
if test_database := os.environ.get("MEDNEXUS_TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = test_database
else:
    os.environ.pop("DATABASE_URL", None)

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session  # noqa: E402

from app.db.models import Role, User  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import CSRF_COOKIE, hash_password, rate_limiter  # noqa: E402

SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"
PASSWORD = "Correct-horse-42"


@pytest.fixture(scope="session")
def app_client() -> Iterator[TestClient]:
    """Runs the application lifespan once (migrations and model loading)."""
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def _fresh_rate_limits() -> None:
    rate_limiter.reset()


def sign_in(email: str, password: str = PASSWORD) -> TestClient:
    client = TestClient(app)
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = client.cookies[CSRF_COOKIE]
    return client


@pytest.fixture(scope="session")
def make_user(app_client: TestClient) -> Callable[[str], TestClient]:
    """Create a user with the given role and return a signed-in client."""

    def create(role: str = Role.RADIOLOGIST) -> TestClient:
        email = f"{role}-{secrets.token_hex(4)}@example.org"
        with Session(get_engine()) as session:
            session.add(User(email=email, full_name=f"Dr. {role.title()}", role=role, password_hash=hash_password(PASSWORD)))
            session.commit()
        return sign_in(email)

    return create


@pytest.fixture(scope="session")
def client(make_user: Callable[[str], TestClient]) -> TestClient:
    """A signed-in radiologist."""
    return make_user(Role.RADIOLOGIST)


@pytest.fixture(scope="session")
def sample() -> Callable[[str], Path]:
    def resolve(name: str) -> Path:
        path = SAMPLES_DIR / name
        if not path.exists():
            pytest.skip("samples missing: run scripts/download_samples.py")
        return path

    return resolve


def upload(client: TestClient, path: Path, *, region: str = "chest", view: str = "PA", stream: bool = False, **form):
    with path.open("rb") as handle:
        return client.post(
            "/api/analyze",
            files={"file": (path.name, handle, "application/octet-stream")},
            data={"modality": "xray", "region": region, "view": view, "language": "en", **form},
            headers={"Accept": "text/event-stream"} if stream else {},
        )


def wait_for(client: TestClient, case_id: int, timeout: float = 180) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/api/cases/{case_id}").json()
        if body["status"] not in ("queued", "analyzing"):
            return body
        time.sleep(0.5)
    raise AssertionError(f"case {case_id} was not analyzed in time")

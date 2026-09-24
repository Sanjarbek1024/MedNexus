import os
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

# Isolate test runs: a throwaway database, and no calls to the real LLM.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="mednexus-test-")
os.environ["GROQ_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def sample() -> Callable[[str], Path]:
    def resolve(name: str) -> Path:
        path = SAMPLES_DIR / name
        if not path.exists():
            pytest.skip("samples missing: run scripts/download_samples.py")
        return path

    return resolve

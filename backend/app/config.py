"""Runtime settings, read from environment variables and ``backend/.env``."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    groq_timeout_s: float = 30.0

    registry_path: Path = BACKEND_DIR / "analyzers.yaml"
    data_dir: Path = BACKEND_DIR / "data"
    device: str = "auto"
    max_upload_mb: int = 40
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Runtime settings, read from environment variables and ``backend/.env``."""

import secrets
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
    # Open-weight vision-language model that reads the image together with the symptoms.
    groq_vision_model: str = "qwen/qwen3.8-27b"
    groq_vision_timeout_s: float = 60.0

    registry_path: Path = BACKEND_DIR / "analyzers.yaml"
    # Model weights live inside the project (backend/weights), so the folder deploys as one unit.
    weights_dir: Path = BACKEND_DIR / "weights"
    data_dir: Path = BACKEND_DIR / "data"
    database_url: str | None = None  # default: SQLite file in data_dir
    device: str = "auto"
    max_upload_mb: int = 40
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Security. SECRET_KEY signs session tokens; PSEUDONYM_KEY derives patient pseudonyms.
    secret_key: str | None = None
    pseudonym_key: str | None = None
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = True  # browsers treat http://localhost as secure
    max_failed_logins: int = 5
    lockout_minutes: int = 15
    login_rate_per_minute: int = 10
    analysis_rate_per_minute: int = 30
    chat_rate_per_minute: int = 20

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return f"sqlite:///{self.data_dir / 'mednexus.db'}"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    def signing_key(self) -> str:
        """SECRET_KEY, or a random key persisted in the data directory for zero-config dev."""
        if self.secret_key:
            return self.secret_key
        path = self.data_dir / ".secret_key"
        if not path.exists():
            self.data_dir.mkdir(parents=True, exist_ok=True)
            path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
        return path.read_text(encoding="utf-8").strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-secret-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Mavva API"
    environment: str = "development"
    secret_key: str = _DEV_SECRET

    database_url: str = "postgresql+psycopg://mavva:mavva@localhost:5433/mavva"

    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    reset_token_expire_minutes: int = 30

    frontend_origin: str = "http://localhost:5173"
    rate_limit_enabled: bool = True

    # Email (production: Resend; otherwise reset links are logged)
    resend_api_key: str | None = None
    email_from: str = "Mavva <noreply@mavva.app>"

    # Question bank location (mounted read-only in Docker)
    content_dir: Path = Path(__file__).resolve().parents[3] / "content"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def production_requires_strong_secret(self) -> "Settings":
        """The default secret is public (open repo) — never allow it to sign
        production JWTs. Refusing to boot is safer than serving forgeable tokens."""
        if self.is_production and (self.secret_key == _DEV_SECRET or len(self.secret_key) < 32):
            raise ValueError(
                "SECRET_KEY must be set to a random value of at least 32 characters "
                "when ENVIRONMENT=production"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

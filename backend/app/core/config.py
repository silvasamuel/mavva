from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
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
    verification_token_expire_hours: int = 24

    # Canonical site URL, or a comma-separated allowlist. The first entry is
    # used in email links; every entry is an allowed CORS origin.
    frontend_origin: str = "http://localhost:5173"
    rate_limit_enabled: bool = True

    # Email (production: Resend; otherwise reset links are logged)
    resend_api_key: str | None = None
    email_from: str = "Mavva <noreply@mavva.app>"

    # Question bank location (mounted read-only in Docker)
    content_dir: Path = Path(__file__).resolve().parents[3] / "content"

    # Admin content write-back. With a token, "Publicar" opens a pull request
    # with the regenerated JSON (fine-grained PAT: contents:write +
    # pull-requests:write). Without one (local dev), files go to content_dir.
    github_token: str | None = None
    github_repo: str = "silvasamuel/mavva"
    github_branch: str = "main"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cors_origins(self) -> list[str]:
        origins = [
            origin.strip().rstrip("/")
            for origin in self.frontend_origin.split(",")
            if origin.strip()
        ]
        return origins or ["http://localhost:5173"]

    @property
    def public_origin(self) -> str:
        """Canonical frontend URL for email links (first FRONTEND_ORIGIN entry)."""
        return self.cors_origins[0]

    @field_validator("database_url", mode="before")
    @classmethod
    def force_psycopg_driver(cls, v: str) -> str:
        """Hosts like Neon/Vercel hand out plain postgresql:// URLs, which
        SQLAlchemy resolves to psycopg2 — not installed here. Pin psycopg (v3)."""
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

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

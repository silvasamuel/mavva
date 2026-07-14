import pytest
from pydantic import ValidationError

from app.core.config import _DEV_SECRET, Settings


class TestProductionSecret:
    def test_production_refuses_the_public_dev_secret(self):
        with pytest.raises(ValidationError, match="SECRET_KEY"):
            Settings(environment="production", secret_key=_DEV_SECRET)

    def test_production_refuses_short_secrets(self):
        with pytest.raises(ValidationError, match="SECRET_KEY"):
            Settings(environment="production", secret_key="short")

    def test_production_accepts_a_strong_secret(self):
        settings = Settings(environment="production", secret_key="x" * 43)
        assert settings.is_production

    def test_development_allows_the_dev_secret(self):
        assert Settings(environment="development", secret_key=_DEV_SECRET)

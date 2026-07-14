import os

# Must be set before any app import (settings are cached at import time).
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://mavva:mavva@localhost:5433/mavva_test")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.seeds.achievements import seed_achievements


def _ensure_database_exists(database_url: str) -> None:
    url = make_url(database_url)
    admin_url = url.set(database="postgres")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as connection:
        exists = connection.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": url.database}
        )
        if not exists:
            connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session")
def engine() -> Generator[Engine, None, None]:
    database_url = get_settings().database_url
    _ensure_database_exists(database_url)
    engine = create_engine(database_url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        seed_achievements(session)
        session.commit()
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Generator[Session, None, None]:
    """Each test runs inside a transaction that is rolled back at the end."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    """Client already registered and authenticated as a fresh user."""
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Samuel Teste", "email": "samuel@teste.com", "password": "senha-forte-123"},
    )
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client

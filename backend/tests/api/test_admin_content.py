import json
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Category, User
from app.models.enums import UserRole
from app.seeds.questions import QuestionFileIn
from app.services import content_sync
from tests.factories import make_category, make_mc_question, make_open_question


def _promote_to_admin(db: Session, email: str = "samuel@teste.com") -> None:
    user = db.query(User).filter(User.email == email).one()
    user.role = UserRole.ADMIN
    db.flush()


class TestSerializer:
    def test_roundtrip_through_seed_validator(self, db: Session):
        """Whatever we write back must be valid input for the seed."""
        category = make_category(db)
        make_mc_question(db, category)
        question = make_open_question(db, category)
        question.is_active = False
        db.flush()

        data = content_sync.serialize_category(db, db.get(Category, category.id))
        assert data is not None
        parsed = QuestionFileIn.model_validate(data)  # raises if invalid
        assert parsed.category == category.slug
        # Deactivation must survive the file round-trip.
        deactivated = next(q for q in parsed.questions if q.external_id == question.external_id)
        assert deactivated.is_active is False
        # Active questions stay lean: no is_active key when true.
        active_raw = next(q for q in data["questions"] if q.get("is_active") is None)
        assert "is_active" not in active_raw

    def test_empty_category_produces_no_file(self, db: Session):
        category = make_category(db, slug="vazia")
        assert content_sync.serialize_category(db, db.get(Category, category.id)) is None


class TestContentEndpoints:
    def test_forbidden_for_regular_user(self, auth_client: TestClient, db: Session):
        assert auth_client.get("/api/v1/admin/content/status").status_code == 403
        assert auth_client.post("/api/v1/admin/content/publish").status_code == 403

    def test_status_then_publish_local_then_clean(
        self, auth_client: TestClient, db: Session, tmp_path: Path, monkeypatch
    ):
        _promote_to_admin(db)
        monkeypatch.setattr(get_settings(), "content_dir", tmp_path)
        category = make_category(db)
        make_mc_question(db, category)

        status = auth_client.get("/api/v1/admin/content/status").json()
        assert status["mode"] == "local"
        expected_file = f"content/questions/{category.slug}.json"
        assert expected_file in status["dirty_files"]

        publish = auth_client.post("/api/v1/admin/content/publish").json()
        assert expected_file in publish["published"]
        assert publish["commit_url"] is None

        written = tmp_path / "questions" / f"{category.slug}.json"
        assert written.exists()
        parsed = json.loads(written.read_text(encoding="utf-8"))
        assert parsed["category"] == category.slug

        # After publishing, nothing is dirty and publish becomes a no-op.
        assert auth_client.get("/api/v1/admin/content/status").json()["dirty_files"] == []
        assert auth_client.post("/api/v1/admin/content/publish").json()["published"] == []

    def test_edit_marks_file_dirty_again(
        self, auth_client: TestClient, db: Session, tmp_path: Path, monkeypatch
    ):
        _promote_to_admin(db)
        monkeypatch.setattr(get_settings(), "content_dir", tmp_path)
        category = make_category(db)
        question = make_mc_question(db, category)
        auth_client.post("/api/v1/admin/content/publish")
        assert auth_client.get("/api/v1/admin/content/status").json()["dirty_files"] == []

        auth_client.patch(
            f"/api/v1/admin/questions/{question.id}",
            json={"text": "Enunciado revisado pelo curador?"},
        )
        dirty = auth_client.get("/api/v1/admin/content/status").json()["dirty_files"]
        assert f"content/questions/{category.slug}.json" in dirty


class TestCategoryIsImmutable:
    def test_category_id_in_patch_is_ignored(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db)
        category = make_category(db)
        other = make_category(db, slug="outra")
        question = make_mc_question(db, category)
        response = auth_client.patch(
            f"/api/v1/admin/questions/{question.id}",
            json={"category_id": other.id, "text": "Texto novo da pergunta?"},
        )
        assert response.status_code == 200
        assert response.json()["category_id"] == category.id  # unchanged

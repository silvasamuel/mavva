"""Writes admin edits back to the versioned question bank.

The DB is the live source; content/questions/*.json is the bootstrap source.
Publishing serializes the DB back into those files so the two never drift:
in local mode files are written to disk (reviewed via git as usual); in
github mode every changed file lands on the repo in a single commit (Git Data
API), which triggers a deploy whose seed realigns the database — closing the
loop.
"""

import json
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models import Category, Question
from app.models.enums import QuestionType

GITHUB_API = "https://api.github.com"


class ContentSyncError(Exception):
    def __init__(self, message: str):
        self.message = message


def serialize_category(db: Session, category: Category) -> dict[str, Any] | None:
    """Rebuilds one content file from the DB (None when the category is empty)."""
    questions = db.scalars(
        select(Question)
        .where(Question.category_id == category.id)
        .options(selectinload(Question.options), selectinload(Question.accepted_answers))
        .order_by(Question.external_id)
    ).all()
    if not questions:
        return None
    items: list[dict[str, Any]] = []
    for q in questions:
        item: dict[str, Any] = {
            "external_id": q.external_id,
            "type": q.type.value,
            "text": q.text,
            "options": (
                [{"text": o.text, "correct": o.is_correct} for o in q.options]
                if q.type == QuestionType.MULTIPLE_CHOICE
                else None
            ),
            "accepted_answers": (
                [a.text for a in q.accepted_answers] if q.type == QuestionType.OPEN_ANSWER else None
            ),
            "explanation": q.explanation,
            "divergence_note": q.divergence_note,
            "reference": {
                "book": q.book,
                "chapter": q.chapter,
                "verse_start": q.verse_start,
                "verse_end": q.verse_end,
            },
            "theme": q.theme,
            "difficulty": q.difficulty.value,
            "subcategory": q.subcategory,
            "tags": list(q.tags),
        }
        if not q.is_active:
            item["is_active"] = False
        items.append(item)
    return {"category": category.slug, "questions": items}


def render_file(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def rendered_files(db: Session) -> dict[str, str]:
    """repo-relative path -> canonical file content, for every non-empty category."""
    files: dict[str, str] = {}
    for category in db.scalars(select(Category).order_by(Category.display_order)):
        data = serialize_category(db, category)
        if data is not None:
            files[f"content/questions/{category.slug}.json"] = render_file(data)
    return files


def write_mode() -> str:
    return "github" if get_settings().github_token else "local"


def _local_path(repo_path: str) -> Path:
    settings = get_settings()
    # repo_path is "content/questions/<slug>.json"; content_dir points at "content/"
    return settings.content_dir / repo_path.removeprefix("content/")


def dirty_files(db: Session, files: dict[str, str]) -> list[str]:
    """Paths whose canonical content differs from the current source of truth."""
    if write_mode() == "github":
        stored = _github_file_shas()
        return [
            path for path, content in files.items() if stored.get(path) != _git_blob_sha(content)
        ]
    dirty = []
    for path, content in files.items():
        local = _local_path(path)
        if not local.exists() or local.read_text(encoding="utf-8") != content:
            dirty.append(path)
    return dirty


def publish(files: dict[str, str], message: str) -> str | None:
    """Writes the given files; returns the commit URL in github mode."""
    if write_mode() == "github":
        return _publish_github(files, message)
    for path, content in files.items():
        local = _local_path(path)
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_text(content, encoding="utf-8")
    return None


# --- GitHub Git Data API (single commit for all files) ---


def _headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _git_blob_sha(content: str) -> str:
    import hashlib

    raw = content.encode("utf-8")
    return hashlib.sha1(b"blob %d\0" % len(raw) + raw).hexdigest()


def _github_file_shas() -> dict[str, str]:
    settings = get_settings()
    response = httpx.get(
        f"{GITHUB_API}/repos/{settings.github_repo}/contents/content/questions",
        params={"ref": settings.github_branch},
        headers=_headers(),
        timeout=15,
    )
    if response.status_code != 200:
        raise ContentSyncError(f"GitHub respondeu {response.status_code} ao listar arquivos")
    return {item["path"]: item["sha"] for item in response.json()}


def _publish_github(files: dict[str, str], message: str) -> str:
    settings = get_settings()
    repo, branch = settings.github_repo, settings.github_branch

    def call(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = httpx.request(
            method, f"{GITHUB_API}/repos/{repo}{path}", headers=_headers(), timeout=30, **kwargs
        )
        if response.status_code >= 300:
            raise ContentSyncError(
                f"GitHub respondeu {response.status_code} em {path}: {response.text[:200]}"
            )
        result: dict[str, Any] = response.json()
        return result

    head_sha = call("GET", f"/git/ref/heads/{branch}")["object"]["sha"]
    base_tree = call("GET", f"/git/commits/{head_sha}")["tree"]["sha"]
    tree = call(
        "POST",
        "/git/trees",
        json={
            "base_tree": base_tree,
            "tree": [
                {"path": path, "mode": "100644", "type": "blob", "content": content}
                for path, content in sorted(files.items())
            ],
        },
    )
    commit = call(
        "POST",
        "/git/commits",
        json={"message": message, "tree": tree["sha"], "parents": [head_sha]},
    )
    call("PATCH", f"/git/refs/heads/{branch}", json={"sha": commit["sha"]})
    return f"https://github.com/{repo}/commit/{commit['sha']}"

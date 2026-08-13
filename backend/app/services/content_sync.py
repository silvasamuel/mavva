"""Writes admin edits back to the versioned question bank.

The DB is the live source; content/questions/*.json is the bootstrap source.
Publishing serializes the DB back into those files so the two never drift:
in local mode files are written to disk (reviewed via git as usual); in
github mode every changed file lands on a dedicated branch as a pull request
against the configured base. Merging (and the following deploy) re-seeds the
database and closes the loop.
"""

import json
from pathlib import Path
from typing import Any, NamedTuple

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models import Category, Question
from app.models.enums import QuestionType

GITHUB_API = "https://api.github.com"
CONTENT_PR_BRANCH = "content/admin-publish"


class ContentSyncError(Exception):
    def __init__(self, message: str):
        self.message = message


class PublishResult(NamedTuple):
    commit_url: str | None = None
    pr_url: str | None = None


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
            "difficulty": q.difficulty.value,
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


def publish(files: dict[str, str], message: str) -> PublishResult:
    """Writes the given files; returns commit/PR URLs in github mode."""
    if write_mode() == "github":
        return _publish_github(files, message)
    for path, content in files.items():
        local = _local_path(path)
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_text(content, encoding="utf-8")
    return PublishResult()


# --- GitHub Git Data API (one commit on a PR branch) ---


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


def _github(method: str, path: str, *, allow_404: bool = False, **kwargs: Any) -> Any:
    settings = get_settings()
    response = httpx.request(
        method,
        f"{GITHUB_API}/repos/{settings.github_repo}{path}",
        headers=_headers(),
        timeout=30,
        **kwargs,
    )
    if allow_404 and response.status_code == 404:
        return None
    if response.status_code >= 300:
        raise ContentSyncError(_github_error(method, path, response))
    if not response.content:
        return None
    return response.json()


def _github_error(method: str, path: str, response: httpx.Response) -> str:
    if response.status_code == 403 and method == "POST" and path.rstrip("/") == "/pulls":
        return "GitHub refused to create the pull request (403)."
    return f"GitHub respondeu {response.status_code} em {path}: {response.text[:200]}"


def _publish_github(files: dict[str, str], message: str) -> PublishResult:
    settings = get_settings()
    repo, base = settings.github_repo, settings.github_branch
    owner = repo.split("/")[0]

    head_sha = _github("GET", f"/git/ref/heads/{base}")["object"]["sha"]
    base_tree = _github("GET", f"/git/commits/{head_sha}")["tree"]["sha"]
    tree = _github(
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
    tree_sha = tree["sha"]
    existing_ref = _github("GET", f"/git/ref/heads/{CONTENT_PR_BRANCH}", allow_404=True)
    if existing_ref is not None:
        existing_commit = _github("GET", f"/git/commits/{existing_ref['object']['sha']}")
        if existing_commit["tree"]["sha"] == tree_sha:
            # Same files already on the branch — a new commit would only
            # retrigger preview deploys. Still try to open the missing PR.
            pr_url = _open_or_reuse_pull_request(owner, base, message, files)
            return PublishResult(
                commit_url=f"https://github.com/{repo}/commit/{existing_ref['object']['sha']}",
                pr_url=pr_url,
            )

    commit = _github(
        "POST",
        "/git/commits",
        json={"message": message, "tree": tree_sha, "parents": [head_sha]},
    )
    commit_sha = commit["sha"]
    commit_url = f"https://github.com/{repo}/commit/{commit_sha}"

    if existing_ref is None:
        _github(
            "POST",
            "/git/refs",
            json={"ref": f"refs/heads/{CONTENT_PR_BRANCH}", "sha": commit_sha},
        )
    else:
        _github(
            "PATCH",
            f"/git/refs/heads/{CONTENT_PR_BRANCH}",
            json={"sha": commit_sha, "force": True},
        )

    pr_url = _open_or_reuse_pull_request(owner, base, message, files)
    return PublishResult(commit_url=commit_url, pr_url=pr_url)


def _open_or_reuse_pull_request(owner: str, base: str, message: str, files: dict[str, str]) -> str:
    head = f"{owner}:{CONTENT_PR_BRANCH}"
    open_prs = _github("GET", "/pulls", params={"head": head, "state": "open"})
    if open_prs:
        url: str = open_prs[0]["html_url"]
        return url

    file_list = "\n".join(f"- `{path}`" for path in sorted(files))
    try:
        created = _github(
            "POST",
            "/pulls",
            json={
                "title": message,
                "head": CONTENT_PR_BRANCH,
                "base": base,
                "body": (
                    "Atualização do banco de perguntas a partir do painel admin.\n\n"
                    f"{file_list}\n\n"
                    "Depois do merge, o deploy seguinte roda o seed e realinha o banco."
                ),
            },
        )
    except ContentSyncError:
        # Two admins can race; reuse the PR that landed first.
        open_prs = _github("GET", "/pulls", params={"head": head, "state": "open"})
        if open_prs:
            url = open_prs[0]["html_url"]
            return url
        raise
    url = created["html_url"]
    return url

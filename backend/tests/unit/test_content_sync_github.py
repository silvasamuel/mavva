import httpx

from app.services import content_sync


def _settings():
    return type("S", (), {"github_repo": "silvasamuel/mavva", "github_branch": "main"})()


def test_first_publish_creates_branch_and_pr(monkeypatch):
    monkeypatch.setattr(content_sync, "get_settings", _settings)
    calls: list[tuple[str, str]] = []

    def fake_github(method: str, path: str, *, allow_404: bool = False, **kwargs: object):
        calls.append((method, path))
        if (method, path) == ("GET", "/git/ref/heads/main"):
            return {"object": {"sha": "mainsha"}}
        if method == "GET" and path.startswith("/git/commits/"):
            return {"tree": {"sha": "treesha"}}
        if (method, path) == ("POST", "/git/trees"):
            return {"sha": "newtree"}
        if (method, path) == ("POST", "/git/commits"):
            return {"sha": "commitsha"}
        if (method, path) == ("GET", "/git/ref/heads/content/admin-publish"):
            assert allow_404
            return None
        if (method, path) == ("POST", "/git/refs"):
            return {"ref": "refs/heads/content/admin-publish"}
        if (method, path) == ("GET", "/pulls"):
            return []
        if (method, path) == ("POST", "/pulls"):
            return {"html_url": "https://github.com/silvasamuel/mavva/pull/99"}
        raise AssertionError((method, path, kwargs))

    monkeypatch.setattr(content_sync, "_github", fake_github)
    result = content_sync._publish_github(
        {"content/questions/reis.json": "{}\n"}, "content: update questions from admin panel"
    )
    assert result.commit_url == "https://github.com/silvasamuel/mavva/commit/commitsha"
    assert result.pr_url == "https://github.com/silvasamuel/mavva/pull/99"
    assert ("POST", "/git/refs") in calls
    assert ("POST", "/pulls") in calls
    assert ("PATCH", "/git/refs/heads/content/admin-publish") not in calls


def test_republish_updates_the_same_pr(monkeypatch):
    monkeypatch.setattr(content_sync, "get_settings", _settings)
    calls: list[tuple[str, str]] = []

    def fake_github(method: str, path: str, *, allow_404: bool = False, **kwargs: object):
        calls.append((method, path))
        if (method, path) == ("GET", "/git/ref/heads/main"):
            return {"object": {"sha": "mainsha"}}
        if (method, path) == ("GET", "/git/commits/mainsha"):
            return {"tree": {"sha": "treesha"}}
        if (method, path) == ("POST", "/git/trees"):
            return {"sha": "newtree"}
        if (method, path) == ("POST", "/git/commits"):
            return {"sha": "commitsha"}
        if (method, path) == ("GET", "/git/ref/heads/content/admin-publish"):
            return {"object": {"sha": "oldsha"}}
        if (method, path) == ("GET", "/git/commits/oldsha"):
            return {"tree": {"sha": "oldtree"}}
        if (method, path) == ("PATCH", "/git/refs/heads/content/admin-publish"):
            return {"ref": "refs/heads/content/admin-publish"}
        if (method, path) == ("GET", "/pulls"):
            return [{"html_url": "https://github.com/silvasamuel/mavva/pull/99"}]
        raise AssertionError((method, path, kwargs))

    monkeypatch.setattr(content_sync, "_github", fake_github)
    result = content_sync._publish_github(
        {"content/questions/reis.json": "{}\n"}, "content: update questions from admin panel"
    )
    assert result.pr_url == "https://github.com/silvasamuel/mavva/pull/99"
    assert ("PATCH", "/git/refs/heads/content/admin-publish") in calls
    assert ("POST", "/pulls") not in calls


def test_identical_republish_does_not_push_again(monkeypatch):
    monkeypatch.setattr(content_sync, "get_settings", _settings)
    calls: list[tuple[str, str]] = []

    def fake_github(method: str, path: str, *, allow_404: bool = False, **kwargs: object):
        calls.append((method, path))
        if (method, path) == ("GET", "/git/ref/heads/main"):
            return {"object": {"sha": "mainsha"}}
        if (method, path) == ("GET", "/git/commits/mainsha"):
            return {"tree": {"sha": "treesha"}}
        if (method, path) == ("POST", "/git/trees"):
            return {"sha": "sametree"}
        if (method, path) == ("GET", "/git/ref/heads/content/admin-publish"):
            return {"object": {"sha": "oldsha"}}
        if (method, path) == ("GET", "/git/commits/oldsha"):
            return {"tree": {"sha": "sametree"}}
        if (method, path) == ("GET", "/pulls"):
            return [{"html_url": "https://github.com/silvasamuel/mavva/pull/99"}]
        raise AssertionError((method, path, kwargs))

    monkeypatch.setattr(content_sync, "_github", fake_github)
    result = content_sync._publish_github(
        {"content/questions/reis.json": "{}\n"}, "content: update questions from admin panel"
    )
    assert result.pr_url == "https://github.com/silvasamuel/mavva/pull/99"
    assert ("POST", "/git/commits") not in calls
    assert ("PATCH", "/git/refs/heads/content/admin-publish") not in calls


def test_pulls_403_explains_missing_permission():
    response = httpx.Response(403, text="Resource not accessible by personal access token")
    message = content_sync._github_error("POST", "/pulls", response)
    assert "pull-requests:write" in message
    assert "403" in message

import pytest

from app import create_app


def test_health_answers_ok(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}


def test_unknown_routes_are_404(client):
    assert client.get("/api/v1/nothing-here").status_code == 404


def test_api_docs_are_off_in_tests(client):
    assert client.get("/api/v1/docs").status_code == 404


def test_production_needs_a_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("SECRETS_FILE", raising=False)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app("production")


def test_production_makes_its_secrets_once_and_keeps_them(monkeypatch, tmp_path):
    """What the Docker image does: no secrets set, so they're made and kept in the data volume."""
    for name in ("SECRET_KEY", "JWT_SECRET_KEY"):
        monkeypatch.delenv(name, raising=False)
    path = tmp_path / "secrets.json"
    monkeypatch.setenv("SECRETS_FILE", str(path))

    first = create_app("production", {"SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"}).config
    assert path.exists()
    assert len(first["SECRET_KEY"]) > 40 and first["SECRET_KEY"] != first["JWT_SECRET_KEY"]

    again = create_app("production", {"SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"}).config
    assert (again["SECRET_KEY"], again["JWT_SECRET_KEY"]) == (first["SECRET_KEY"], first["JWT_SECRET_KEY"])

    monkeypatch.setenv("SECRET_KEY", "set-by-the-owner-" + "x" * 40)  # one set by hand wins
    assert create_app("production", {"SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"}).config["SECRET_KEY"] \
        == "set-by-the-owner-" + "x" * 40

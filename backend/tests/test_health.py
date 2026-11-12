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
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app("production")

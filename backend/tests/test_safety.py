"""Safety: limits on password guessing, and security headers on every response."""
import shutil

import pytest

from app import create_app
from app.core import limits
from tests.test_approvals import PASSWORD, setup_family


def sign_in(client, identifier, password):
    return client.post("/auth/login", json={"identifier": identifier, "password": password})


def test_too_many_wrong_passwords_for_one_account_are_stopped(api):
    pat, _, _ = setup_family(api)
    guesser = api()
    for _ in range(limits.LIMITS["login"]):
        assert sign_in(guesser, "pat@example.test", "wrong-guess").status_code == 401
    res = sign_in(guesser, "pat@example.test", "wrong-guess")
    assert res.status_code == 429 and res.get_json()["error"] == "too_many_attempts"
    assert res.get_json()["message"] == "Too many wrong tries. Please wait about 15 minutes and try again."
    # Even the right password has to wait now, so guessing can't go on…
    assert sign_in(api(), "Pat@Example.test", PASSWORD).status_code == 429
    # …but other accounts aren't affected.
    assert sign_in(api(), "pat-mia", "kidpass1").status_code == 200


def test_a_right_password_clears_the_count(api):
    setup_family(api)
    for _ in range(limits.LIMITS["login"] - 1):
        sign_in(api(), "pat-mia", "nope")
    assert sign_in(api(), "pat-mia", "kidpass1").status_code == 200
    for _ in range(limits.LIMITS["login"] - 1):
        assert sign_in(api(), "pat-mia", "nope").status_code == 401  # counting from zero again
    assert sign_in(api(), "pat-mia", "kidpass1").status_code == 200


def test_one_address_trying_many_accounts_is_stopped(api, monkeypatch):
    setup_family(api)
    monkeypatch.setitem(limits.LIMITS, "login_ip", 3)
    for name in ("anna", "ben", "carl"):
        assert sign_in(api(), name, "guess").status_code == 401  # all from the same test address
    assert sign_in(api(), "dora", "guess").status_code == 429


def test_password_checks_before_removing_a_kid_are_limited(api):
    pat, mia, _ = setup_family(api)
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    for _ in range(limits.LIMITS["password"]):
        res = pat.delete(f"/family/children/{mia_id}", json={"password": "wrong"})
        assert res.status_code == 400 and "password" in res.get_json()["errors"]
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 429


def test_limits_can_be_switched_off(api, app):
    app.config["RATE_LIMIT_ENABLED"] = False
    setup_family(api)
    for _ in range(limits.LIMITS["login"] + 2):
        assert sign_in(api(), "pat-mia", "nope").status_code == 401


def test_every_response_has_security_headers(api, client):
    res = api().get("/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "same-origin"
    assert res.headers["Cross-Origin-Resource-Policy"] == "same-origin"
    assert res.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert "Strict-Transport-Security" not in res.headers  # only when served over HTTPS
    assert client.get("/no-such-page").headers["X-Frame-Options"] == "DENY"  # errors too


@pytest.fixture
def app_with(request):
    """An app made with some settings changed; its photo folder is removed afterwards."""
    made = []

    def make(**overrides):
        limits.reset()
        made.append(create_app("testing", overrides=overrides))
        return made[-1]

    yield make
    for application in made:
        shutil.rmtree(application.config["UPLOAD_FOLDER"], ignore_errors=True)


def test_https_sites_also_get_strict_transport_security(app_with):
    app = app_with(JWT_COOKIE_SECURE=True)
    res = app.test_client().get("/api/v1/health")
    assert res.headers["Strict-Transport-Security"] == "max-age=31536000"


def test_behind_a_proxy_the_real_address_is_counted(app_with, monkeypatch):
    app = app_with(TRUSTED_PROXIES=1)
    monkeypatch.setitem(limits.LIMITS, "login_ip", 1)
    client = app.test_client()
    first = client.post("/api/v1/auth/login", json={"identifier": "x", "password": "y"},
                        headers={"X-Forwarded-For": "203.0.113.5"})
    other = client.post("/api/v1/auth/login", json={"identifier": "z", "password": "y"},
                        headers={"X-Forwarded-For": "198.51.100.7"})
    again = client.post("/api/v1/auth/login", json={"identifier": "w", "password": "y"},
                        headers={"X-Forwarded-For": "203.0.113.5"})
    assert (first.status_code, other.status_code, again.status_code) == (401, 401, 429)

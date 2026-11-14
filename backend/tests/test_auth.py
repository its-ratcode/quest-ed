from app.extensions import db
from app.models import ROLE_CHILD, Family, User

PASSWORD = "parent-pass-123"


def register(client, email="pat@example.test", **extra):
    payload = {"display_name": "Pat", "email": email, "password": PASSWORD, "family_name": "The Testers"}
    payload.update(extra)
    return client.post("/auth/register", json=payload)


def test_sign_up_creates_a_parent_and_family_and_signs_in(api):
    browser = api()
    res = register(browser, email="Pat@Example.TEST", role="admin")
    assert res.status_code == 201
    user = res.get_json()["user"]
    assert user["role"] == "parent"  # a role sent by the browser is ignored
    assert user["email"] == "pat@example.test"

    me = browser.get("/auth/me").get_json()
    assert me["user"]["id"] == user["id"]
    assert me["family"]["name"] == "The Testers"
    assert len(me["family"]["invite_code"]) == 8  # parents see the invite code


def test_session_cookies_are_httponly_and_scripts_get_only_the_csrf_value(api):
    res = register(api())
    cookies = res.headers.getlist("Set-Cookie")
    access = next(c for c in cookies if c.startswith("access_token_cookie="))
    csrf = next(c for c in cookies if c.startswith("csrf_access_token="))
    assert "HttpOnly" in access and "SameSite=Lax" in access
    assert "HttpOnly" not in csrf


def test_sign_up_checks_its_fields(api):
    res = api().post("/auth/register", json={"email": "not-an-email", "password": "short"})
    assert res.status_code == 400
    errors = res.get_json()["errors"]
    assert set(errors) == {"display_name", "email", "password", "family_name"}

    register(api())
    taken = register(api(), email="PAT@example.test")
    assert taken.status_code == 400 and "already exists" in taken.get_json()["errors"]["email"]


def test_sign_in_with_email_or_kid_username(api, app):
    register(api())
    with app.app_context():
        kid = User(role=ROLE_CHILD, username="mia", display_name="Mia", family=db.session.get(Family, 1))
        kid.set_password("kidpass1")
        db.session.add(kid)
        db.session.commit()

    parent = api().post("/auth/login", json={"identifier": " PAT@example.test ", "password": PASSWORD})
    assert parent.status_code == 200 and parent.get_json()["user"]["role"] == "parent"
    child = api()
    assert child.post("/auth/login", json={"identifier": "Mia", "password": "kidpass1"}).status_code == 200
    assert "invite_code" not in child.get("/auth/me").get_json()["family"]  # kids don't see it


def test_wrong_password_and_unknown_account_get_the_same_answer(api):
    register(api())
    wrong = api().post("/auth/login", json={"identifier": "pat@example.test", "password": "nope"})
    unknown = api().post("/auth/login", json={"identifier": "nobody@example.test", "password": "nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.get_json() == unknown.get_json()


def test_switched_off_accounts_cannot_sign_in(api, app):
    register(api())
    with app.app_context():
        db.session.get(User, 1).is_active = False
        db.session.commit()
    res = api().post("/auth/login", json={"identifier": "pat@example.test", "password": PASSWORD})
    assert res.status_code == 403 and res.get_json()["error"] == "account_inactive"


def test_me_needs_a_session(api):
    res = api().get("/auth/me")
    assert res.status_code == 401 and res.get_json()["error"] == "unauthorized"


def test_refresh_needs_the_csrf_header(api):
    browser = api()
    register(browser)
    assert browser.post("/auth/refresh").status_code == 200
    without_header = browser.raw.post("/api/v1/auth/refresh")
    assert without_header.status_code == 401 and without_header.get_json()["error"] == "csrf_failed"


def test_sign_out_ends_the_session_for_good(api):
    browser = api()
    register(browser)
    refresh_cookie = browser.raw.get_cookie("refresh_token_cookie", path="/api/v1/auth/").value
    csrf_refresh = browser.raw.get_cookie("csrf_refresh_token").value

    assert browser.post("/auth/logout").status_code == 200
    assert browser.get("/auth/me").status_code == 401  # cookies are gone

    # Even a copy of the old refresh cookie no longer works.
    thief = api()
    thief.raw.set_cookie("refresh_token_cookie", refresh_cookie, path="/api/v1/auth/")
    thief.raw.set_cookie("csrf_refresh_token", csrf_refresh)
    res = thief.post("/auth/refresh")
    assert res.status_code == 401 and res.get_json()["error"] == "token_revoked"


def test_sign_out_works_even_without_a_session(api):
    assert api().post("/auth/logout").status_code == 200

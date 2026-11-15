from app.extensions import db
from app.models import ROLE_CHILD, Family, User

PASSWORD = "parent-pass-123"


def signed_up(api):
    browser = api()
    res = browser.post("/auth/register", json={"display_name": "Pat", "email": "pat@example.test",
                                               "password": PASSWORD, "family_name": "The Testers"})
    assert res.status_code == 201
    return browser


def test_change_your_name_and_avatar(api):
    browser = signed_up(api)
    res = browser.patch("/auth/me", json={"display_name": "  Pat Rivera ", "avatar": "🦦"})
    assert res.status_code == 200
    assert res.get_json()["user"]["display_name"] == "Pat Rivera"
    assert browser.get("/auth/me").get_json()["user"]["avatar"] == "🦦"

    # Only what's sent changes; the role can't be changed this way.
    browser.patch("/auth/me", json={"avatar": "🌟", "role": "admin"})
    me = browser.get("/auth/me").get_json()["user"]
    assert me["display_name"] == "Pat Rivera" and me["avatar"] == "🌟" and me["role"] == "parent"


def test_profile_changes_are_checked(api):
    browser = signed_up(api)
    res = browser.patch("/auth/me", json={"display_name": "   ", "avatar": "x" * 17})
    assert res.status_code == 400
    assert set(res.get_json()["errors"]) == {"display_name", "avatar"}
    assert browser.get("/auth/me").get_json()["user"]["display_name"] == "Pat"  # nothing saved
    assert api().patch("/auth/me", json={"display_name": "X"}).status_code == 401


def test_change_password_needs_the_current_one(api):
    browser = signed_up(api)
    wrong = browser.post("/auth/change-password", json={"current_password": "nope", "new_password": "a-new-pass-1"})
    assert wrong.status_code == 400 and "incorrect" in wrong.get_json()["errors"]["current_password"]
    short = browser.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": "short"})
    assert short.status_code == 400 and "new_password" in short.get_json()["errors"]

    ok = browser.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": "a-new-pass-1"})
    assert ok.status_code == 200
    login = lambda pw: api().post("/auth/login", json={"identifier": "pat@example.test", "password": pw})  # noqa: E731
    assert login(PASSWORD).status_code == 401
    assert login("a-new-pass-1").status_code == 200


def test_kids_cannot_change_their_own_password(api, app):
    signed_up(api)
    with app.app_context():
        kid = User(role=ROLE_CHILD, username="mia", display_name="Mia", family=db.session.get(Family, 1))
        kid.set_password("kidpass1")
        db.session.add(kid)
        db.session.commit()
    child = api()
    child.post("/auth/login", json={"identifier": "mia", "password": "kidpass1"})
    res = child.post("/auth/change-password", json={"current_password": "kidpass1", "new_password": "new-pass-123"})
    assert res.status_code == 403

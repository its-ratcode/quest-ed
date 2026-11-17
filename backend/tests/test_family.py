from app.extensions import db
from app.models import User

PASSWORD = "parent-pass-123"


def parent(api, email="pat@example.test", family_name="The Testers"):
    browser = api()
    res = browser.post("/auth/register", json={"display_name": "Pat", "email": email,
                                               "password": PASSWORD, "family_name": family_name})
    assert res.status_code == 201
    return browser


def add_kid(browser, username="mia", **extra):
    payload = {"display_name": username.title(), "username": username, "password": "kidpass1"}
    payload.update(extra)
    return browser.post("/family/children", json=payload)


def test_parents_add_kids_who_can_then_sign_in(api):
    pat = parent(api)
    res = add_kid(pat, username="Mia", avatar="🦄")
    assert res.status_code == 201
    kid = res.get_json()["child"]
    assert kid["role"] == "child" and kid["username"] == "mia" and kid["avatar"] == "🦄"

    family = pat.get("/family").get_json()
    assert [m["display_name"] for m in family["members"]] == ["Pat", "Mia"]
    assert family["members"][0]["email"] == "pat@example.test"  # parents see emails

    mia = api()
    assert mia.post("/auth/login", json={"identifier": "mia", "password": "kidpass1"}).status_code == 200
    seen_by_kid = mia.get("/family").get_json()
    assert "invite_code" not in seen_by_kid["family"]
    assert all("email" not in m for m in seen_by_kid["members"])  # kids don't


def test_new_kids_are_checked(api):
    pat = parent(api)
    res = pat.post("/family/children", json={"username": "a b", "password": "123"})
    assert res.status_code == 400
    assert set(res.get_json()["errors"]) == {"display_name", "username", "password"}
    add_kid(pat)
    taken = add_kid(parent(api, email="sam@example.test"), username="MIA")  # usernames are site-wide
    assert taken.status_code == 400 and "taken" in taken.get_json()["errors"]["username"]


def test_parents_edit_a_kid_and_set_a_new_password(api):
    pat = parent(api)
    kid_id = add_kid(pat).get_json()["child"]["id"]
    res = pat.patch(f"/family/children/{kid_id}", json={"display_name": "Mia R.", "avatar": "🦦",
                                                       "password": "newkidpass"})
    assert res.status_code == 200 and res.get_json()["child"]["display_name"] == "Mia R."
    assert api().post("/auth/login", json={"identifier": "mia", "password": "kidpass1"}).status_code == 401
    assert api().post("/auth/login", json={"identifier": "mia", "password": "newkidpass"}).status_code == 200
    assert pat.patch(f"/family/children/{kid_id}", json={"password": "123"}).status_code == 400


def test_removing_a_kid_needs_the_parents_password(api, app):
    pat = parent(api)
    kid_id = add_kid(pat).get_json()["child"]["id"]
    wrong = pat.delete(f"/family/children/{kid_id}", json={"password": "nope"})
    assert wrong.status_code == 400 and wrong.get_json()["errors"]["password"] == "That password isn't right."

    assert pat.delete(f"/family/children/{kid_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.get(User, kid_id) is None
    assert api().post("/auth/login", json={"identifier": "mia", "password": "kidpass1"}).status_code == 401


def test_only_parents_manage_kids_and_only_their_own(api):
    pat = parent(api)
    kid_id = add_kid(pat).get_json()["child"]["id"]
    sam = parent(api, email="sam@example.test", family_name="Other family")

    # Another family's parent: the kid doesn't exist for them.
    assert sam.patch(f"/family/children/{kid_id}", json={"display_name": "Hacked"}).status_code == 404
    assert sam.delete(f"/family/children/{kid_id}", json={"password": PASSWORD}).status_code == 404

    # A kid can't add or edit kids.
    mia = api()
    mia.post("/auth/login", json={"identifier": "mia", "password": "kidpass1"})
    assert add_kid(mia, username="sneaky").status_code == 403
    assert mia.patch(f"/family/children/{kid_id}", json={"display_name": "Boss"}).status_code == 403

    # A parent's own account isn't a "child" to edit here.
    pat_id = pat.get("/auth/me").get_json()["user"]["id"]
    assert pat.patch(f"/family/children/{pat_id}", json={"display_name": "X"}).status_code == 404

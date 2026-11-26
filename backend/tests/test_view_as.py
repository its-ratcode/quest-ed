"""A parent opens one of their kids' accounts, and switches back with their password."""
from app.extensions import db
from app.models import AuditLog, TokenBlocklist

PASSWORD = "parent-pass-123"


def family(api, email="pat@example.test", kid="mia"):
    pat = api()
    assert pat.post("/auth/register", json={"display_name": "Pat", "email": email, "password": PASSWORD,
                                            "family_name": "The Testers"}).status_code == 201
    kid_id = pat.post("/family/children", json={"display_name": kid.title(), "username": kid,
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    return pat, kid_id


def test_a_parent_opens_a_kids_account_and_switches_back_with_their_password(api, app):
    pat, mia_id = family(api)
    task = pat.post("/tasks", json={"title": "Feed the cat", "points": 5, "assigned_to_id": mia_id}).get_json()["task"]
    assert pat.get("/auth/me").get_json()["acting_parent"] is None

    res = pat.post(f"/auth/view-as/{mia_id}")
    assert res.status_code == 200 and res.get_json()["user"]["id"] == mia_id
    me = pat.get("/auth/me").get_json()
    assert me["user"]["role"] == "child" and me["acting_parent"]["display_name"] == "Pat"

    # Now it's Mia's account: kid things work, parent things don't.
    assert pat.post(f"/tasks/{task['id']}/submit", json={"note": "Done"}).status_code == 201
    assert pat.post("/tasks", json={"title": "x", "points": 1, "assigned_to_id": mia_id}).status_code == 403
    assert pat.post(f"/auth/view-as/{mia_id}").status_code == 403
    assert pat.post("/auth/refresh").status_code == 200  # a renewed session is still "opened by Pat"
    assert pat.get("/auth/me").get_json()["acting_parent"]["display_name"] == "Pat"

    wrong = pat.post("/auth/switch-back", json={"password": "not-it"})
    assert wrong.status_code == 400 and "password" in wrong.get_json()["errors"]
    assert pat.post("/auth/switch-back", json={}).status_code == 400
    back = pat.post("/auth/switch-back", json={"password": PASSWORD})
    assert back.status_code == 200 and back.get_json()["user"]["role"] == "parent"
    me = pat.get("/auth/me").get_json()
    assert me["user"]["display_name"] == "Pat" and me["acting_parent"] is None
    assert len(pat.get("/tasks/submissions").get_json()["items"]) == 1  # what was done as Mia stays done

    with app.app_context():
        actions = [a.action for a in db.session.query(AuditLog).order_by(AuditLog.id)]
        assert "auth.view_as_child" in actions and actions[-1] == "auth.switch_back"
        assert db.session.query(TokenBlocklist).count() >= 2  # each replaced session was ended


def test_guessing_the_parents_password_is_limited(api):
    pat, mia_id = family(api)
    pat.post(f"/auth/view-as/{mia_id}")
    for _ in range(5):
        assert pat.post("/auth/switch-back", json={"password": "guess"}).status_code == 400
    blocked = pat.post("/auth/switch-back", json={"password": PASSWORD})
    assert blocked.status_code == 429 and blocked.get_json()["error"] == "too_many_attempts"


def test_only_a_parent_and_only_their_own_active_kids(api):
    pat, mia_id = family(api)
    sam, leo_id = family(api, email="sam@example.test", kid="leo")
    assert pat.post(f"/auth/view-as/{leo_id}").status_code == 404  # another family's kid
    assert pat.post("/auth/view-as/99999").status_code == 404

    mia = api()
    mia.post("/auth/login", json={"identifier": "mia", "password": "kidpass1"})
    assert mia.post(f"/auth/view-as/{mia_id}").status_code == 403
    not_acting = mia.post("/auth/switch-back", json={"password": PASSWORD})
    assert not_acting.status_code == 409 and not_acting.get_json()["error"] == "not_acting"
    assert mia.get("/auth/me").get_json()["acting_parent"] is None

    admin = api()
    admin.post("/auth/setup", json={"display_name": "Alex", "email": "alex@example.test",
                                    "password": "admin-pass-1234"})
    assert admin.post(f"/auth/view-as/{mia_id}").status_code == 403  # not for administrators
    assert admin.patch(f"/admin/users/{mia_id}", json={"is_active": False}).status_code == 200
    assert pat.post(f"/auth/view-as/{mia_id}").status_code == 404  # a switched-off account stays closed
    assert sam.post(f"/auth/view-as/{mia_id}").status_code == 404

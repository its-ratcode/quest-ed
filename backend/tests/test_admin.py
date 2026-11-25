"""The administrator: first-run setup, accounts, site settings, notices and the action log."""
from datetime import date, timedelta

from app.extensions import db
from app.models import AuditLog
from tests.test_approvals import PASSWORD, setup_family

ADMIN_PASSWORD = "admin-pass-1234"


def setup_admin(api):
    admin = api()
    res = admin.post("/auth/setup", json={"display_name": "Alex", "email": "Alex@Example.TEST",
                                          "password": ADMIN_PASSWORD})
    assert res.status_code == 201
    return admin


def test_first_run_setup_makes_one_administrator(api):
    visitor = api()
    assert visitor.get("/site/config").get_json() == {"features": {"registration": True}, "needs_setup": True}
    weak = visitor.post("/auth/setup", json={"display_name": "Alex", "email": "a@example.test", "password": "short-pw"})
    assert weak.status_code == 400 and "password" in weak.get_json()["errors"]

    admin = setup_admin(api)
    me = admin.get("/auth/me").get_json()
    assert (me["user"]["role"], me["user"]["email"], me["family"]) == ("admin", "alex@example.test", None)
    assert visitor.get("/site/config").get_json()["needs_setup"] is False

    again = api().post("/auth/setup", json={"display_name": "Eve", "email": "eve@example.test",
                                            "password": "another-pass-123"})
    assert again.status_code == 409 and again.get_json()["error"] == "already_set_up"
    assert api().post("/auth/login", json={"identifier": "eve@example.test",
                                           "password": "another-pass-123"}).status_code == 401


def test_only_the_administrator_gets_in(api):
    setup_admin(api)
    pat, mia, _ = setup_family(api)
    for path in ("/admin/stats", "/admin/users", "/admin/settings", "/admin/audit-logs", "/admin/notices"):
        assert pat.get(path).status_code == 403, path
        assert mia.get(path).status_code == 403, path
        assert api().get(path).status_code == 401, path


def test_stats_and_finding_accounts(api):
    admin = setup_admin(api)
    setup_family(api)
    setup_family(api, email="sam@example.test")
    stats = admin.get("/admin/stats").get_json()
    assert stats["users"] == {"admin": 1, "parent": 2, "child": 2}
    assert (stats["families"], stats["tasks"], stats["inactive_users"]) == (2, 2, 0)

    everyone = admin.get("/admin/users").get_json()
    assert everyone["total"] == 5 and everyone["items"][0]["username"] == "sam-mia"  # newest first
    assert everyone["items"][0]["family_name"] == "The Testers"
    found = admin.get("/admin/users?q=SAM").get_json()["items"]
    assert {u["display_name"] for u in found} == {"Pat", "Mia"}  # sam@… and sam-mia
    assert admin.get("/admin/users?role=child").get_json()["total"] == 2
    assert admin.get("/admin/users?q=%25").get_json()["total"] == 0  # "%" is searched for, not a wildcard
    page = admin.get("/admin/users?per_page=5&page=2").get_json()
    assert (page["items"], page["per_page"]) == ([], 5)


def test_switching_an_account_off_ends_its_sessions(api):
    admin = setup_admin(api)
    pat, mia, _ = setup_family(api)
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]

    res = admin.patch(f"/admin/users/{mia_id}", json={"is_active": False})
    assert res.status_code == 200 and res.get_json()["user"]["is_active"] is False
    assert mia.get("/auth/me").status_code == 401  # signed out straight away
    again = api().post("/auth/login", json={"identifier": "pat-mia", "password": "kidpass1"})
    assert again.status_code == 403 and again.get_json()["error"] == "account_inactive"
    assert admin.get("/admin/users?status=inactive").get_json()["total"] == 1

    admin.patch(f"/admin/users/{mia_id}", json={"is_active": True})
    assert api().post("/auth/login", json={"identifier": "pat-mia", "password": "kidpass1"}).status_code == 200

    admin_id = admin.get("/auth/me").get_json()["user"]["id"]
    assert admin.patch(f"/admin/users/{admin_id}", json={"is_active": False}).status_code == 409
    assert admin.patch(f"/admin/users/{mia_id}", json={}).status_code == 400
    assert admin.patch("/admin/users/999", json={"is_active": False}).status_code == 404


def test_a_new_password_only_for_parents(api):
    admin = setup_admin(api)
    pat, mia, _ = setup_family(api)
    pat_id = pat.get("/auth/me").get_json()["user"]["id"]
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]

    assert admin.patch(f"/admin/users/{pat_id}", json={"password": "short"}).status_code == 400
    assert admin.patch(f"/admin/users/{pat_id}", json={"password": "brand-new-pass"}).status_code == 200
    assert api().post("/auth/login", json={"identifier": "pat@example.test", "password": PASSWORD}).status_code == 401
    assert api().post("/auth/login", json={"identifier": "pat@example.test",
                                           "password": "brand-new-pass"}).status_code == 200
    assert admin.patch(f"/admin/users/{mia_id}", json={"password": "kid-new-pass"}).status_code == 409


def test_closing_sign_ups(api):
    admin = setup_admin(api)
    pat, _, _ = setup_family(api)
    code = pat.get("/family").get_json()["family"]["invite_code"]
    assert admin.put("/admin/settings", json={"features": {"nope": True}}).status_code == 400
    assert admin.put("/admin/settings", json={"features": {"registration": "no"}}).status_code == 400

    res = admin.put("/admin/settings", json={"features": {"registration": False}})
    assert res.get_json() == {"features": {"registration": False}, "labels": {"registration": "New parent sign-ups"}}
    assert api().get("/site/config").get_json()["features"]["registration"] is False
    closed = api().post("/auth/register", json={"display_name": "Robin", "email": "robin@example.test",
                                                "password": PASSWORD, "invite_code": code})
    assert closed.status_code == 403 and closed.get_json()["error"] == "registration_closed"
    assert api().post("/auth/login", json={"identifier": "pat@example.test", "password": PASSWORD}).status_code == 200

    admin.put("/admin/settings", json={"features": {"registration": True}})
    assert api().post("/auth/register", json={"display_name": "Robin", "email": "robin@example.test",
                                              "password": PASSWORD, "invite_code": code}).status_code == 201


def test_notices_reach_the_right_people(api):
    admin = setup_admin(api)
    pat, mia, _ = setup_family(api)
    post = lambda **body: admin.post("/admin/notices", json=body)  # noqa: E731
    assert post(message="").status_code == 400
    assert post(message="Hi", audience="teachers").status_code == 400
    yesterday = (date.today() - timedelta(days=2)).isoformat()
    assert post(message="Old news", expires_on=yesterday).status_code == 400

    everyone = post(message="New badges are here!").get_json()["notice"]
    assert (everyone["level"], everyone["audience"], everyone["expires_at"]) == ("info", "all", None)
    post(message="Maintenance on Sunday", level="warning", audience="parents",
         expires_on=(date.today() + timedelta(days=3)).isoformat())
    post(message="Well done, everyone", audience="children")

    seen = lambda who: [n["message"] for n in who.get("/site/notices").get_json()["items"]]  # noqa: E731
    assert seen(pat) == ["Maintenance on Sunday", "New badges are here!"]
    assert seen(mia) == ["Well done, everyone", "New badges are here!"]
    assert len(seen(admin)) == 3
    assert api().get("/site/notices").status_code == 401

    assert admin.delete(f"/admin/notices/{everyone['id']}").get_json()["notice"]["is_active"] is False
    assert seen(pat) == ["Maintenance on Sunday"]
    assert len(admin.get("/admin/notices").get_json()["items"]) == 3  # still listed, marked as taken down
    assert admin.delete("/admin/notices/999").status_code == 404


def test_the_action_log(api, app):
    admin = setup_admin(api)
    pat, mia, _ = setup_family(api)
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    admin.patch(f"/admin/users/{mia_id}", json={"is_active": False})
    admin.put("/admin/settings", json={"features": {"registration": False}})
    admin.put("/admin/settings", json={"features": {"registration": False}})  # no change, not logged again

    logs = admin.get("/admin/audit-logs").get_json()
    actions = [i["action"] for i in logs["items"]]
    assert actions[:2] == ["settings.changed", "user.deactivated"]  # newest first
    assert actions.count("settings.changed") == 1 and actions[-1] == "site.setup"
    switched_off = logs["items"][1]
    assert switched_off["actor"]["display_name"] == "Alex" and switched_off["target_id"] == mia_id
    assert switched_off["details"] == {"role": "child"}  # no names

    only_auth = admin.get("/admin/audit-logs?action=auth.").get_json()["items"]
    assert only_auth and all(i["action"].startswith("auth.") for i in only_auth)
    assert admin.get("/admin/audit-logs?action=%25").get_json()["total"] == 0
    with app.app_context():
        assert db.session.query(AuditLog).filter_by(action="settings.changed").one().family_id is None

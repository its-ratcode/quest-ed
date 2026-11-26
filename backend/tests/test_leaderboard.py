from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import PointTransaction

PASSWORD = "parent-pass-123"


def family(api, email="pat@example.test", kids=("mia", "leo", "zoe")):
    """A parent and signed-in kids. Returns (parent, {username: (client, id)})."""
    pat = api()
    assert pat.post("/auth/register", json={"display_name": "Pat", "email": email, "password": PASSWORD,
                                            "family_name": "The Testers"}).status_code == 201
    signed_in = {}
    for name in kids:
        kid_id = pat.post("/family/children", json={"display_name": name.title(), "username": name,
                                                    "password": "kidpass1"}).get_json()["child"]["id"]
        client = api()
        client.post("/auth/login", json={"identifier": name, "password": "kidpass1"})
        signed_in[name] = (client, kid_id)
    return pat, signed_in


def approve(pat, kid, kid_id, points, title="A task"):
    task = pat.post("/tasks", json={"title": title, "points": points, "assigned_to_id": kid_id}).get_json()["task"]
    kid.post(f"/tasks/{task['id']}/submit", json={})
    waiting = [s for s in pat.get("/tasks/submissions").get_json()["items"] if s["task"]["id"] == task["id"]]
    assert pat.post(f"/tasks/submissions/{waiting[0]['id']}/approve", json={}).status_code == 200


def test_off_until_a_parent_turns_it_on(api, app):
    pat, kids = family(api)
    mia = kids["mia"][0]
    assert pat.get("/family").get_json()["family"]["leaderboard_enabled"] is False
    off = mia.get("/leaderboard")
    assert off.status_code == 403 and off.get_json()["error"] == "leaderboard_off"
    assert pat.get("/leaderboard").status_code == 200  # parents can look first

    assert mia.patch("/family", json={"leaderboard_enabled": True}).status_code == 403  # kids can't turn it on
    assert pat.patch("/family", json={"leaderboard_enabled": "yes please"}).status_code == 400
    assert pat.patch("/family", json={"leaderboard_enabled": True}).get_json()["family"]["leaderboard_enabled"] is True
    assert mia.get("/leaderboard").status_code == 200
    assert mia.get("/auth/me").get_json()["family"]["leaderboard_enabled"] is True  # the kid's menu shows it

    pat.patch("/family", json={"leaderboard_enabled": True})  # no change: logged once
    pat.patch("/family", json={"leaderboard_enabled": False})
    with app.app_context():
        from app.models import AuditLog
        actions = [a.action for a in db.session.query(AuditLog).filter(AuditLog.action.like("family.leaderboard%"))]
        assert actions == ["family.leaderboard_on", "family.leaderboard_off"]


def test_ranks_this_weeks_effort_not_savings(api, app):
    pat, kids = family(api)
    pat.patch("/family", json={"leaderboard_enabled": True})
    (mia, mia_id), (leo, leo_id), (zoe, _zoe_id) = kids["mia"], kids["leo"], kids["zoe"]
    approve(pat, mia, mia_id, 20)
    approve(pat, leo, leo_id, 15)
    approve(pat, leo, leo_id, 5)  # same points as Mia, but more tasks
    # Spending or a parent's change by hand doesn't count, nor does last month's work.
    assert pat.post("/points/adjustments", json={"child_id": mia_id, "amount": 500,
                                                 "reason": "Birthday"}).status_code == 201
    with app.app_context():
        old = db.session.query(PointTransaction).filter_by(child_id=mia_id, kind="task_reward").one()
        db.session.add(PointTransaction(family_id=old.family_id, child_id=mia_id, amount=99, balance_after=0,
                                        kind="task_reward", description="Long ago",
                                        created_at=datetime.now(timezone.utc) - timedelta(days=40)))
        db.session.commit()

    board = zoe.get("/leaderboard").get_json()
    assert board["period"] == "week" and board["team_points"] == 40
    ranked = [(r["rank"], r["child"]["display_name"], r["points"], r["tasks"]) for r in board["items"]]
    assert ranked == [(1, "Leo", 20, 2), (2, "Mia", 20, 1), (3, "Zoe", 0, 0)]
    assert [r["is_me"] for r in board["items"]] == [False, False, True]
    assert "points_balance" not in board["items"][0]["child"]  # balances stay private

    month = zoe.get("/leaderboard?period=month").get_json()
    assert month["period"] == "month" and month["since"].endswith("-01")
    assert zoe.get("/leaderboard?period=year").status_code == 400


def test_only_your_own_family_and_the_site_switch(api):
    pat, kids = family(api, kids=("mia",))
    pat.patch("/family", json={"leaderboard_enabled": True})
    sam, others = family(api, email="sam@example.test", kids=("ben",))
    sam.patch("/family", json={"leaderboard_enabled": True})
    names = [r["child"]["display_name"] for r in kids["mia"][0].get("/leaderboard").get_json()["items"]]
    assert names == ["Mia"]  # never another family's kids

    admin = api()
    admin.post("/auth/setup", json={"display_name": "Alex", "email": "alex@example.test",
                                    "password": "admin-pass-1234"})
    assert admin.get("/leaderboard").status_code == 403  # not for administrators
    admin.put("/admin/settings", json={"features": {"leaderboard": False}})
    for client in (kids["mia"][0], pat, others["ben"][0]):
        res = client.get("/leaderboard")
        assert res.status_code == 403 and res.get_json()["error"] == "feature_disabled"

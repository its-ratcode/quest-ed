"""The data export: a family's (or one kid's) activity as a JSON file to keep."""
import json
from datetime import timedelta

from app.extensions import db
from app.models import PointTransaction, utcnow
from tests.test_approvals import PASSWORD, setup_family


def family_with_activity(api):
    """Pat with Mia (one approved task with notes, a routine, a reward bought) and Leo. Returns (pat, mia, ids)."""
    pat, mia, task = setup_family(api)
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    leo_id = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    mia.post(f"/tasks/{task['id']}/submit", json={"note": "All done!"})
    sub = pat.get("/tasks/submissions").get_json()["items"][0]
    pat.post(f"/tasks/submissions/{sub['id']}/approve", json={"note": "Well done"})
    pat.post("/routines", json={"title": "Brush teeth", "points": 2, "weekdays": [0, 2, 4], "assigned_to_id": mia_id})
    sticker = pat.post("/rewards", json={"title": "Sticker", "cost": 5}).get_json()["reward"]
    mia.post(f"/rewards/{sticker['id']}/redeem")
    return pat, mia, {"mia": mia_id, "leo": leo_id}


def download(client, query=""):
    res = client.get(f"/family/export{query}")
    assert res.status_code == 200, res.get_data(as_text=True)
    return res


def test_the_family_export_has_everything_and_no_secrets(api):
    pat, _, _ = family_with_activity(api)
    res = download(pat)
    assert res.mimetype == "application/json"
    assert res.headers["Cache-Control"] == "no-store"
    assert res.headers["Content-Disposition"].startswith('attachment; filename="quest-ed-the-testers-')
    data = res.get_json()
    assert data["family"] == "The Testers" and data["period"] == "everything" and "about" in data
    assert [k["name"] for k in data["children"]] == ["Mia", "Leo"]

    mia = data["children"][0]
    assert mia["points_balance"] == 5
    assert mia["summary"]["tasks_approved"] == 1 and mia["summary"]["rewards_bought"] == 1
    assert mia["summary"]["points_earned"] == 10 and mia["summary"]["points_spent"] == 5
    assert mia["summary"]["badges_earned"] >= 2  # "First task" and "First reward"
    entry = mia["task_history"][0]
    assert (entry["task"], entry["category"], entry["result"]) == ("Tidy your room", "Chores", "approved")
    assert (entry["kid_note"], entry["parent_note"], entry["had_photo"]) == ("All done!", "Well done", False)
    assert mia["routines"] == [{"title": "Brush teeth", "category": "Chores", "points": 2,
                                "days": ["Mon", "Wed", "Fri"], "paused": False}]
    assert [p["reason"] for p in mia["points"]] == ["Completed: Tidy your room", "Bought: Sticker"]
    assert mia["rewards"][0]["status"] == "waiting to be handed over"
    assert {"First task", "First reward"} <= {b["badge"] for b in mia["badges"]}

    # Everything but the "about" note (which says what's left out) holds no account details.
    text = json.dumps({key: value for key, value in data.items() if key != "about"}).lower()
    for secret in ("pat@example.test", "pat-mia", "pat-leo", "password", "invite", '"id"'):
        assert secret not in text, secret


def test_one_kid_and_a_recent_period(api, app):
    pat, _, ids = family_with_activity(api)
    with app.app_context():  # move the task's points 100 days back
        tx = db.session.query(PointTransaction).filter_by(description="Completed: Tidy your room").one()
        tx.created_at = utcnow() - timedelta(days=100)
        db.session.commit()

    res = download(pat, f"?child_id={ids['mia']}&days=30")
    assert '"quest-ed-mia-' in res.headers["Content-Disposition"]
    data = res.get_json()
    assert data["period"] == "last 30 days"
    assert [k["name"] for k in data["children"]] == ["Mia"]
    assert [p["reason"] for p in data["children"][0]["points"]] == ["Bought: Sticker"]
    assert len(download(pat, f"?child_id={ids['mia']}").get_json()["children"][0]["points"]) == 2


def test_only_parents_of_the_family_export(api):
    pat, mia, ids = family_with_activity(api)
    assert mia.get("/family/export").status_code == 403
    assert pat.get("/family/export?days=lots").status_code == 400
    assert download(pat, "?days=0").get_json()["period"] == "today"  # kept within limits, like everywhere
    sam = api()
    sam.post("/auth/register", json={"display_name": "Sam", "email": "sam@example.test", "password": PASSWORD,
                                     "family_name": "Others"})
    assert sam.get(f"/family/export?child_id={ids['mia']}").status_code == 404
    assert sam.get("/family/export").get_json()["children"] == []
    assert api().get("/family/export").status_code == 401

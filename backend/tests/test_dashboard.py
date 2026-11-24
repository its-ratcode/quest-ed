"""The savings goal, the dashboards' one-request summaries, and tasks since a date."""
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import SavingsGoal
from tests.test_approvals import PASSWORD, setup_family


def utc_today():
    """Today for a test family (they're in UTC), whatever the computer's own time zone."""
    return datetime.now(timezone.utc).date()


def family(api, points=0):
    """Pat, Mia (signed in) with `points`, and Mia's 10-point task. Returns (pat, mia, mia_id, task)."""
    pat, mia, task = setup_family(api)
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    if points:
        pat.post("/points/adjustments", json={"child_id": mia_id, "amount": points, "reason": "Start"})
    return pat, mia, mia_id, task


def reward(pat, title, cost, **extra):
    return pat.post("/rewards", json={"title": title, "cost": cost, **extra}).get_json()["reward"]


def test_a_kid_saves_up_for_one_reward_until_they_buy_it(api):
    pat, mia, _, _ = family(api, points=50)
    bike = reward(pat, "New bike", 500)
    zoo = reward(pat, "Zoo trip", 40)
    assert mia.get("/rewards").get_json()["goal_reward_id"] is None
    assert "goal_reward_id" not in pat.get("/rewards").get_json()  # parents don't have one

    res = mia.put(f"/rewards/{bike['id']}/goal")
    assert res.status_code == 200 and res.get_json()["goal"]["title"] == "New bike"
    assert mia.get("/rewards").get_json()["goal_reward_id"] == bike["id"]
    assert mia.get("/dashboard/summary").get_json()["savings_goal"]["title"] == "New bike"

    mia.put(f"/rewards/{zoo['id']}/goal")  # one goal at a time: this replaces the bike
    assert mia.get("/rewards").get_json()["goal_reward_id"] == zoo["id"]
    bought = mia.post(f"/rewards/{zoo['id']}/redeem").get_json()
    assert bought["goal_reached"] is True
    assert mia.get("/rewards").get_json()["goal_reward_id"] is None  # reached, so it's cleared

    mia.put(f"/rewards/{bike['id']}/goal")
    assert mia.delete("/rewards/goal").get_json() == {"goal": None}
    assert mia.get("/dashboard/summary").get_json()["savings_goal"] is None


def test_goal_rules(api):
    pat, mia, mia_id, _ = family(api)
    bike = reward(pat, "New bike", 500)
    mia.put(f"/rewards/{bike['id']}/goal")
    pat.delete(f"/rewards/{bike['id']}")  # taken out of the shop: no goal any more
    assert mia.get("/dashboard/summary").get_json()["savings_goal"] is None
    assert mia.put(f"/rewards/{bike['id']}/goal").status_code == 409
    assert pat.put(f"/rewards/{bike['id']}/goal").status_code == 403  # parents don't save

    sam = api()
    sam.post("/auth/register", json={"display_name": "Sam", "email": "sam@example.test", "password": PASSWORD,
                                     "family_name": "Others"})
    other = reward(sam, "Not yours", 5)
    assert mia.put(f"/rewards/{other['id']}/goal").status_code == 404


def test_the_kids_summary(api):
    pat, mia, mia_id, task = family(api, points=20)
    reward(pat, "Sticker", 5)
    reward(pat, "Ice cream", 30, stock=0)
    pat.post("/tasks", json={"title": "Feed the cat", "points": 5, "assigned_to_id": mia_id})
    mia.post(f"/tasks/{task['id']}/submit", json={})

    data = mia.get("/dashboard/summary").get_json()
    assert data["role"] == "child" and data["balance"] == 20 and data["earned_this_week"] == 20
    assert data["task_counts"] == {"open": 1, "submitted": 1, "approved_this_week": 0}
    assert [t["title"] for t in data["next_tasks"]] == ["Feed the cat"]
    assert data["recent_transactions"][0]["description"] == "Start"
    assert [(r["title"], r["affordable"]) for r in data["reward_highlights"]] == [("Sticker", True), ("Ice cream", False)]
    assert data["pending_redemptions"] == 0 and data["savings_goal"] is None


def test_the_parents_summary(api):
    pat, mia, mia_id, task = family(api)
    leo_id = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    today = utc_today().isoformat()
    pat.post("/tasks", json={"title": "Homework", "points": 5, "assigned_to_id": leo_id, "due_date": today})
    pat.post("/routines", json={"title": "Brush teeth", "points": 2, "weekdays": list(range(7)),
                                "assigned_to_id": mia_id})  # today's copy is due today
    mia.post(f"/tasks/{task['id']}/submit", json={"note": "Done!"})
    pat.post("/points/adjustments", json={"child_id": mia_id, "amount": 40, "reason": "Birthday"})
    sticker = reward(pat, "Sticker", 5)
    mia.post(f"/rewards/{sticker['id']}/redeem")

    data = pat.get("/dashboard/summary").get_json()
    assert data["role"] == "parent"
    kids = {k["display_name"]: k for k in data["children"]}
    assert (kids["Mia"]["open_tasks"], kids["Mia"]["today_total"], kids["Mia"]["today_done"]) == (1, 1, 0)
    assert (kids["Leo"]["open_tasks"], kids["Leo"]["today_total"]) == (1, 1)
    assert kids["Mia"]["points_balance"] == 35
    assert data["pending_submissions_total"] == 1
    assert data["pending_submissions"][0]["note"] == "Done!"
    assert [r["reward_title"] for r in data["pending_redemptions"]] == ["Sticker"]
    assert data["recent_activity"][0]["description"] == "Bought: Sticker"
    assert data["approved_this_week"] == 0

    sub = data["pending_submissions"][0]
    pat.post(f"/tasks/submissions/{sub['id']}/approve", json={})
    data = pat.get("/dashboard/summary").get_json()
    assert data["approved_this_week"] == 1 and data["pending_submissions_total"] == 0


def test_tasks_since_a_date(api):
    pat, mia, mia_id, task = family(api)
    long_ago = (utc_today() - timedelta(days=30)).isoformat()
    last_week = (utc_today() - timedelta(days=7)).isoformat()
    old = pat.post("/tasks", json={"title": "Old one", "points": 1, "assigned_to_id": mia_id,
                                   "due_date": long_ago}).get_json()["task"]
    mia.post(f"/tasks/{old['id']}/submit", json={})
    sub = pat.get("/tasks/submissions").get_json()["items"][0]
    pat.post(f"/tasks/submissions/{sub['id']}/approve", json={})  # done long ago
    pat.post("/tasks", json={"title": "Overdue", "points": 1, "assigned_to_id": mia_id, "due_date": long_ago})

    titles = {t["title"] for t in pat.get(f"/tasks?status=all&since={last_week}").get_json()["items"]}
    assert titles == {"Tidy your room", "Overdue"}  # undated, and still open; not the finished old one
    assert pat.get("/tasks?since=yesterday").status_code == 400


def test_the_admin_summary_and_removing_a_kid(api, app):
    pat, mia, mia_id, _ = family(api)
    bike = reward(pat, "New bike", 500)
    mia.put(f"/rewards/{bike['id']}/goal")
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.query(SavingsGoal).count() == 0
    assert api().get("/dashboard/summary").status_code == 401

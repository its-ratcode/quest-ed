"""Badges: earned automatically from what kids do, or given by a parent, sometimes with a prize."""
from datetime import timedelta

from app.extensions import db
from app.models import Badge, EarnedBadge, TaskSubmission, utcnow
from tests.test_approvals import PASSWORD, setup_family


def family(api):
    """Pat and Mia (signed in), and Mia's 10-point task. Returns (pat, mia, mia_id, task)."""
    pat, mia, task = setup_family(api)
    return pat, mia, mia.get("/auth/me").get_json()["user"]["id"], task


def finish(pat, mia, task):
    """Mia sends the task and Pat approves it. Returns the approval's JSON."""
    mia.post(f"/tasks/{task['id']}/submit", json={})
    sub = pat.get("/tasks/submissions").get_json()["items"][0]
    return pat.post(f"/tasks/submissions/{sub['id']}/approve", json={}).get_json()


def new_task(pat, mia_id, title="Tidy up", points=10, category="chores"):
    return pat.post("/tasks", json={"title": title, "points": points, "assigned_to_id": mia_id,
                                    "category": category}).get_json()["task"]


def badge_named(client, title, child_id=None):
    path = "/badges/progress" + (f"?child_id={child_id}" if child_id else "")
    return next(b for b in client.get(path).get_json()["badges"] if b["title"] == title)


def add_badge(pat, **fields):
    res = pat.post("/badges", json={"title": "Helper", "rule": "tasks", "target": 5, **fields})
    assert res.status_code == 201, res.get_json()
    return res.get_json()["badge"]


def test_a_new_family_gets_starter_badges_and_the_first_task_earns_one(api):
    pat, mia, mia_id, task = family(api)
    progress = mia.get("/badges/progress").get_json()
    assert len(progress["badges"]) == 9 and progress["earned_count"] == 0
    first = badge_named(mia, "First task")
    assert (first["progress"], first["target"], first["earned_at"]) == (0, 1, None)

    approved = finish(pat, mia, task)
    assert approved["new_badges"] == [first["id"]]
    first = badge_named(mia, "First task")
    assert first["earned_at"] is not None and first["progress"] == 1
    assert badge_named(mia, "Ten done")["progress"] == 1
    assert mia.get("/badges/progress").get_json()["streak"] == {"current": 1, "best": 1}
    # The parent sees the same for Mia, and how many kids earned each badge.
    assert badge_named(pat, "First task", child_id=mia_id)["earned_at"] is not None
    listed = {b["title"]: b for b in pat.get("/badges").get_json()["items"]}
    assert listed["First task"]["earned_count"] == 1 and listed["Ten done"]["earned_count"] == 0
    assert listed["Ten done"]["goal"] == "Get 10 tasks approved."
    assert pat.get("/badges/progress").status_code == 400  # parents say which kid


def test_streaks_count_days_in_a_row(api, app):
    pat, mia, mia_id, task = family(api)
    tasks = [task] + [new_task(pat, mia_id, f"Task {i}") for i in range(3)]
    for t in tasks:
        finish(pat, mia, t)
    with app.app_context():  # move the "I did it"s to today, yesterday, two and four days ago
        subs = db.session.query(TaskSubmission).order_by(TaskSubmission.id).all()
        for sub, days_ago in zip(subs, (0, 1, 2, 4)):
            sub.submitted_at = utcnow() - timedelta(days=days_ago)
        db.session.commit()
    progress = mia.get("/badges/progress").get_json()
    assert progress["streak"] == {"current": 3, "best": 3}
    assert badge_named(mia, "Three days running")["earned_at"] is not None
    assert badge_named(mia, "A full week")["progress"] == 3


def test_a_badge_for_one_category_with_a_prize(api):
    pat, mia, mia_id, task = family(api)
    reward = pat.post("/rewards", json={"title": "Ice cream", "cost": 30, "emoji": "🍦", "stock": 2}).get_json()["reward"]
    badge = add_badge(pat, title="Bookworm", rule="category_tasks", category="learning", target=1, icon="book",
                      tone="lilac", bonus_points=15, bonus_reward_id=reward["id"])
    assert (badge["category"], badge["bonus_points"], badge["bonus_reward"]["title"]) == ("learning", 15, "Ice cream")
    assert badge_named(mia, "Bookworm")["description"] == "Get 1 “Learning” tasks approved."

    finish(pat, mia, task)  # a chores task: not this badge
    assert badge_named(mia, "Bookworm")["earned_at"] is None
    approved = finish(pat, mia, new_task(pat, mia_id, "Read a chapter", category="learning"))
    assert badge["id"] in approved["new_badges"]

    history = mia.get("/points/transactions").get_json()["items"]
    assert (history[0]["amount"], history[0]["description"], history[0]["kind"]) == (15, "Badge bonus: Bookworm",
                                                                                     "badge_bonus")
    assert mia.get("/points/summary").get_json()["balance"] == 10 + 10 + 15
    free = pat.get("/rewards/redemptions?status=pending").get_json()["items"]
    assert [(r["reward_title"], r["cost"]) for r in free] == [("Ice cream", 0)]  # waits to be handed over
    assert pat.get("/rewards").get_json()["items"][0]["stock"] == 1
    assert badge_named(mia, "First reward")["earned_at"] is None  # a free one isn't "bought"

    # Cancelling a free reward gives back no points, but the stock comes back.
    res = pat.post(f"/rewards/redemptions/{free[0]['id']}/cancel")
    assert res.status_code == 200 and res.get_json()["balance"] == 35
    assert pat.get("/rewards").get_json()["items"][0]["stock"] == 2


def test_parents_give_manual_badges_by_hand(api):
    pat, mia, mia_id, _ = family(api)
    leo_id = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    kind = add_badge(pat, title="Kind heart", rule="manual", target=99, bonus_points=5)
    assert kind["target"] is None
    assert badge_named(mia, "Kind heart")["manual"] is True

    res = pat.post(f"/badges/{kind['id']}/award", json={"child_id": mia_id})
    assert res.status_code == 201 and res.get_json()["balance"] == 5
    assert badge_named(mia, "Kind heart")["earned_at"] is not None
    again = pat.post(f"/badges/{kind['id']}/award", json={"child_id": mia_id})
    assert again.status_code == 409 and again.get_json()["error"] == "already_earned"
    assert mia.get("/points/summary").get_json()["balance"] == 5  # the prize only once

    just_leo = add_badge(pat, title="Leo's badge", rule="manual", child_id=leo_id)
    assert pat.post(f"/badges/{just_leo['id']}/award", json={"child_id": mia_id}).status_code == 409
    assert all(b["title"] != "Leo's badge" for b in mia.get("/badges/progress").get_json()["badges"])
    assert mia.post(f"/badges/{kind['id']}/award", json={"child_id": mia_id}).status_code == 403


def test_badge_fields_are_checked(api):
    pat, mia, mia_id, _ = family(api)
    res = pat.post("/badges", json={"title": "", "rule": "tasks", "icon": "dragon", "tone": "red"})
    assert res.status_code == 400 and {"title", "target", "icon", "tone"} <= set(res.get_json()["errors"])
    assert "rule" in pat.post("/badges", json={"title": "X", "rule": "magic"}).get_json()["errors"]
    res = pat.post("/badges", json={"title": "X", "rule": "category_tasks", "target": 2, "category": "nope"})
    assert "category" in res.get_json()["errors"]

    hidden = pat.post("/rewards", json={"title": "Old toy", "cost": 5}).get_json()["reward"]
    pat.delete(f"/rewards/{hidden['id']}")
    res = pat.post("/badges", json={"title": "X", "rule": "manual", "bonus_reward_id": hidden["id"]})
    assert res.status_code == 400 and "bonus_reward_id" in res.get_json()["errors"]

    manual = add_badge(pat, title="Star", rule="manual")
    assert "target" in pat.patch(f"/badges/{manual['id']}", json={"rule": "tasks"}).get_json()["errors"]
    helper = add_badge(pat, target=5)
    changed = pat.patch(f"/badges/{helper['id']}", json={"rule": "streak"}).get_json()["badge"]
    assert (changed["rule"], changed["target"]) == ("streak", 5)  # keeps its goal number

    sam = api()
    sam.post("/auth/register", json={"display_name": "Sam", "email": "sam@example.test", "password": PASSWORD,
                                     "family_name": "Others"})
    assert sam.patch(f"/badges/{helper['id']}", json={"title": "Mine"}).status_code == 404
    assert sam.post(f"/badges/{helper['id']}/award", json={"child_id": mia_id}).status_code == 404
    assert sam.get(f"/badges/progress?child_id={mia_id}").status_code == 404
    assert mia.post("/badges", json={"title": "Free", "rule": "manual"}).status_code == 403


def test_a_new_badge_already_reached_is_given_straight_away(api, app):
    pat, mia, mia_id, task = family(api)
    finish(pat, mia, task)
    badge = add_badge(pat, title="One down", target=1)
    with app.app_context():  # given when it was made, before anyone looked
        assert db.session.query(EarnedBadge).filter(EarnedBadge.badge_id == badge["id"]).count() == 1
    assert badge_named(mia, "One down")["earned_at"] is not None


def test_saving_points_earns_the_saver_badge(api):
    pat, mia, mia_id, _ = family(api)
    pat.post("/points/adjustments", json={"child_id": mia_id, "amount": 100, "reason": "Birthday"})
    assert badge_named(mia, "Saved up 100")["earned_at"] is not None


def test_removing_and_bringing_back_starter_badges(api):
    pat, mia, _, _ = family(api)
    first = next(b for b in pat.get("/badges").get_json()["items"] if b["title"] == "First task")
    changed = next(b for b in pat.get("/badges").get_json()["items"] if b["title"] == "Ten done")
    pat.patch(f"/badges/{changed['id']}", json={"title": "Ten finished"})
    assert pat.delete(f"/badges/{first['id']}").get_json()["badge"]["is_active"] is False
    assert all(b["title"] != "First task" for b in mia.get("/badges/progress").get_json()["badges"])
    assert pat.patch(f"/badges/{first['id']}", json={"title": "Back"}).status_code == 404

    res = pat.post("/badges/starters")
    assert res.status_code == 201 and [b["title"] for b in res.get_json()["added"]] == ["First task"]
    titles = [b["title"] for b in pat.get("/badges").get_json()["items"]]
    assert "Ten finished" in titles and "Ten done" not in titles  # changed ones stay changed
    assert pat.post("/badges/starters").status_code == 200  # nothing left to bring back


def test_families_from_before_badges_get_the_starters(api, app):
    pat, mia, _, _ = family(api)
    with app.app_context():
        db.session.query(Badge).delete()
        db.session.commit()
    assert len(pat.get("/badges").get_json()["items"]) == 9


def test_removing_a_kid_removes_their_badges(api, app):
    pat, mia, mia_id, task = family(api)
    finish(pat, mia, task)
    add_badge(pat, title="Mia's own", rule="manual", child_id=mia_id)
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.query(EarnedBadge).count() == 0
        assert db.session.query(Badge).filter(Badge.title == "Mia's own").count() == 0
        assert db.session.query(Badge).count() == 9  # the family's badges stay

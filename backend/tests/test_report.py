"""A kid's last 30 days, for parents."""
from datetime import timedelta

from app.extensions import db
from app.models import FocusSession, Task, utcnow

PASSWORD = "parent-pass-123"


def setup(api, email="pat@example.test", kid="mia"):
    pat = api()
    pat.post("/auth/register", json={"display_name": "Pat", "email": email, "password": PASSWORD,
                                     "family_name": "The Testers"})
    kid_id = pat.post("/family/children", json={"display_name": kid.title(), "username": kid,
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    child = api()
    child.post("/auth/login", json={"identifier": kid, "password": "kidpass1"})
    return pat, child, kid_id


def review(pat, child, kid_id, points, approve=True):
    task = pat.post("/tasks", json={"title": "A task", "points": points, "assigned_to_id": kid_id}).get_json()["task"]
    child.post(f"/tasks/{task['id']}/submit", json={})
    sub = [s for s in pat.get("/tasks/submissions").get_json()["items"] if s["task"]["id"] == task["id"]][0]
    action = "approve" if approve else "reject"
    assert pat.post(f"/tasks/submissions/{sub['id']}/{action}", json={"note": "Again please"}).status_code == 200


def test_the_last_30_days_at_a_glance(api, app):
    pat, mia, mia_id = setup(api)
    review(pat, mia, mia_id, 10)
    review(pat, mia, mia_id, 20)
    review(pat, mia, mia_id, 5, approve=False)
    pat.post("/points/adjustments", json={"child_id": mia_id, "amount": -4, "reason": "Counted twice"})
    with app.app_context():
        family_id = db.session.query(Task).first().family_id
        today = utcnow().date()
        # Two routine days missed in the period, one long before it; 25 minutes of focus, one stopped early.
        for back in (2, 3, 60):
            db.session.add(Task(family_id=family_id, title="Brush teeth", points=5, assigned_to_id=mia_id,
                                created_by_id=db.session.query(Task).first().created_by_id, status="expired",
                                occurrence_date=today - timedelta(days=back), due_date=today - timedelta(days=back)))
        db.session.add_all([
            FocusSession(family_id=family_id, child_id=mia_id, minutes=25, status="completed",
                         started_at=utcnow() - timedelta(days=1)),
            FocusSession(family_id=family_id, child_id=mia_id, minutes=10, status="cancelled",
                         started_at=utcnow() - timedelta(days=1)),
        ])
        db.session.commit()

    report = pat.get(f"/report?child_id={mia_id}").get_json()
    assert report["days"] == 30
    assert (report["approved"], report["sent_back"]) == (2, 1)
    assert (report["routines_done"], report["routines_missed"], report["routine_rate"]) == (0, 2, 0.0)
    assert (report["points_earned"], report["points_spent"], report["focus_minutes"]) == (30, 4, 25)
    assert pat.get(f"/report?child_id={mia_id}&days=7").get_json()["days"] == 7


def test_parents_only_and_only_their_own_kids(api):
    pat, mia, mia_id = setup(api)
    assert mia.get(f"/report?child_id={mia_id}").status_code == 403
    assert pat.get("/report").status_code == 400
    assert pat.get(f"/report?child_id={mia_id}").get_json()["routine_rate"] is None  # no routines yet
    _sam, _leo, leo_id = setup(api, email="sam@example.test", kid="leo")
    assert pat.get(f"/report?child_id={leo_id}").status_code == 404

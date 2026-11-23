"""Routines: tasks that repeat on chosen days. Each day the kid gets that day's copy."""
from datetime import datetime, timedelta, timezone

import pytest

from app.extensions import db
from app.models import Routine, Task
from app.services import routines as routine_service
from tests.test_approvals import PASSWORD, setup_family

MONDAY = datetime(2026, 11, 23, 10, 0, tzinfo=timezone.utc)
MON, TUE, WED = 0, 1, 2


@pytest.fixture
def clock(monkeypatch):
    """The time the app sees. Starts on a Monday morning (UTC); clock.days(1) moves it a day on."""
    class Clock:
        now = MONDAY

        def days(self, n):
            self.now += timedelta(days=n)

    c = Clock()
    monkeypatch.setattr(routine_service, "_now", lambda: c.now)
    return c


def family(api):
    """Pat and Mia (signed in), without the starter task. Returns (pat, mia, mia_id)."""
    pat, mia, task = setup_family(api)
    pat.delete(f"/tasks/{task['id']}")
    return pat, mia, mia.get("/auth/me").get_json()["user"]["id"]


def add_routine(pat, child_id, **fields):
    data = {"title": "Make your bed", "points": 5, "weekdays": [0, 1, 2, 3, 4, 5, 6], "assigned_to_id": child_id,
            **fields}
    res = pat.post("/routines", json=data)
    assert res.status_code == 201, res.get_json()
    return res.get_json()["routine"]


def todays(client):
    """The kid's active tasks that came from a routine."""
    return [t for t in client.get("/tasks").get_json()["items"] if t["routine"]]


def test_a_routine_gives_todays_task_straight_away_and_only_once(api, clock):
    pat, mia, mia_id = family(api)
    routine = add_routine(pat, mia_id, weekdays=[4, 0, 0])
    assert routine["weekdays"] == [0, 4] and routine["status"] == "active"
    assert routine["assigned_to"]["display_name"] == "Mia"

    tasks = todays(mia)
    assert len(tasks) == 1
    assert (tasks[0]["title"], tasks[0]["points"], tasks[0]["due_date"]) == ("Make your bed", 5, "2026-11-23")
    assert tasks[0]["routine"] == {"id": routine["id"], "weekdays": [0, 4]}
    assert len(todays(mia)) == 1 and len(todays(pat)) == 1  # looking again makes no second copy


def test_a_new_day_brings_a_new_copy_and_lets_yesterdays_go(api, clock):
    pat, mia, mia_id = family(api)
    add_routine(pat, mia_id, title="Feed the cat")
    add_routine(pat, mia_id, title="Read")
    feed, read = sorted(todays(mia), key=lambda t: t["title"])
    mia.post(f"/tasks/{read['id']}/submit", json={"note": "Chapter 3"})

    clock.days(1)
    today = todays(mia)
    assert {(t["title"], t["due_date"]) for t in today} == {("Feed the cat", "2026-11-24"), ("Read", "2026-11-24"),
                                                            ("Read", "2026-11-23")}  # sent: still to check
    expired = mia.get("/tasks?status=expired").get_json()["items"]
    assert [t["id"] for t in expired] == [feed["id"]]  # not done in time: dropped, no penalty
    assert mia.post(f"/tasks/{feed['id']}/submit", json={}).status_code == 409
    assert pat.patch(f"/tasks/{feed['id']}", json={"points": 50}).status_code == 409

    # Yesterday's sent copy can still be approved, and gives its points.
    sub = pat.get("/tasks/submissions").get_json()["items"][0]
    res = pat.post(f"/tasks/submissions/{sub['id']}/approve", json={})
    assert res.status_code == 200 and res.get_json()["balance"] == 5


def test_only_on_the_chosen_days(api, clock):
    pat, mia, mia_id = family(api)
    add_routine(pat, mia_id, weekdays=[WED])
    assert todays(mia) == []  # Monday
    clock.days(1)
    assert todays(mia) == []  # Tuesday
    clock.days(1)
    assert [t["due_date"] for t in todays(mia)] == ["2026-11-25"]  # Wednesday


def test_changing_a_routine_changes_todays_copy_until_it_is_sent(api, clock):
    pat, mia, mia_id = family(api)
    leo_id = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    routine = add_routine(pat, mia_id)
    res = pat.patch(f"/routines/{routine['id']}", json={"title": "Make the bed", "points": 8})
    assert res.status_code == 200 and res.get_json()["routine"]["points"] == 8
    assert [(t["title"], t["points"]) for t in todays(mia)] == [("Make the bed", 8)]

    pat.patch(f"/routines/{routine['id']}", json={"assigned_to_id": leo_id})
    assert todays(mia) == []
    assert [t["assigned_to"]["display_name"] for t in todays(pat)] == ["Leo"]

    leo = api()
    leo.post("/auth/login", json={"identifier": "pat-leo", "password": "kidpass1"})
    copy = todays(leo)[0]
    leo.post(f"/tasks/{copy['id']}/submit", json={})
    pat.patch(f"/routines/{routine['id']}", json={"points": 99})
    assert pat.get(f"/tasks/{copy['id']}").get_json()["task"]["points"] == 8  # already sent: unchanged


def test_pause_resume_and_delete(api, clock, app):
    pat, mia, mia_id = family(api)
    routine = add_routine(pat, mia_id, weekdays=[TUE, WED])
    assert pat.patch(f"/routines/{routine['id']}", json={"status": "paused"}).get_json()["routine"]["status"] == "paused"
    clock.days(1)
    assert todays(mia) == []  # paused: no task on Tuesday
    pat.patch(f"/routines/{routine['id']}", json={"status": "active"})
    assert len(todays(mia)) == 1  # resumed: Tuesday's task appears straight away

    gone = pat.delete(f"/routines/{routine['id']}")
    assert gone.status_code == 200 and gone.get_json()["routine"]["status"] == "archived"
    assert todays(mia) == []
    assert mia.get("/tasks?status=archived").get_json()["items"][0]["routine"]["id"] == routine["id"]
    assert pat.get("/routines").get_json()["items"] == []
    assert [r["id"] for r in pat.get("/routines?status=archived").get_json()["items"]] == [routine["id"]]
    assert pat.patch(f"/routines/{routine['id']}", json={"status": "active"}).status_code == 409
    clock.days(1)
    assert todays(mia) == []  # deleted: no task on Wednesday either
    with app.app_context():  # only Tuesday's copy was ever made
        assert db.session.query(Task).filter(Task.routine_id == routine["id"]).count() == 1


def test_routine_fields_are_checked_and_only_parents_of_the_family_use_them(api, clock):
    pat, mia, mia_id = family(api)
    for bad in ([], [7], [True], "0123", None):
        res = pat.post("/routines", json={"title": "Read", "points": 5, "weekdays": bad, "assigned_to_id": mia_id})
        assert res.status_code == 400 and "weekdays" in res.get_json()["errors"], bad
    res = pat.post("/routines", json={"title": "", "points": 0, "weekdays": [0]})
    assert res.status_code == 400 and {"title", "points", "assigned_to_id"} <= set(res.get_json()["errors"])

    routine = add_routine(pat, mia_id)
    assert pat.patch(f"/routines/{routine['id']}", json={"weekdays": []}).status_code == 400
    assert pat.patch(f"/routines/{routine['id']}", json={"status": "archived"}).status_code == 400
    assert mia.get("/routines").status_code == 403
    assert mia.post("/routines", json={"title": "Free points", "points": 5, "weekdays": [0],
                                       "assigned_to_id": mia_id}).status_code == 403

    sam = api()
    sam.post("/auth/register", json={"display_name": "Sam", "email": "sam@example.test", "password": PASSWORD,
                                     "family_name": "Others"})
    assert sam.patch(f"/routines/{routine['id']}", json={"points": 1}).status_code == 404
    assert sam.delete(f"/routines/{routine['id']}").status_code == 404
    assert sam.post("/routines", json={"title": "Read", "points": 5, "weekdays": [0],
                                       "assigned_to_id": mia_id}).status_code == 404
    assert sam.get("/routines").get_json()["items"] == []


def test_several_kids_get_one_routine_each(api, clock):
    pat, mia, mia_id = family(api)
    leo_id = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    res = pat.post("/routines", json={"title": "Brush teeth", "points": 2, "weekdays": [MON],
                                      "assigned_to_ids": [mia_id, leo_id]})
    assert res.status_code == 201 and len(res.get_json()["routines"]) == 2
    assert sorted(t["assigned_to"]["display_name"] for t in todays(pat)) == ["Leo", "Mia"]


def test_the_day_starts_in_the_familys_time_zone(api, clock):
    pat, mia, mia_id = family(api)
    add_routine(pat, mia_id, weekdays=[TUE])
    assert todays(mia) == []  # Monday 10:00 in UTC
    # In Kiritimati (UTC+14) it's already Tuesday: changing the time zone brings Tuesday's task.
    assert pat.patch("/family", json={"timezone": "Pacific/Kiritimati"}).status_code == 200
    assert [t["due_date"] for t in todays(mia)] == ["2026-11-24"]


def test_removing_a_kid_removes_their_routines(api, clock, app):
    pat, mia, mia_id = family(api)
    leo_id = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    routine = add_routine(pat, leo_id)
    leo = api()
    leo.post("/auth/login", json={"identifier": "pat-leo", "password": "kidpass1"})
    leos_copy = todays(leo)[0]
    leo.post(f"/tasks/{leos_copy['id']}/submit", json={})  # sent, so it stays Leo's
    pat.patch(f"/routines/{routine['id']}", json={"assigned_to_id": mia_id})
    clock.days(1)
    assert [t["assigned_to"]["display_name"] for t in todays(pat) if t["due_date"] == "2026-11-24"] == ["Mia"]

    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.query(Routine).count() == 0
        kept = db.session.get(Task, leos_copy["id"])  # Leo's work stays, no longer linked to a routine
        assert kept is not None and kept.routine_id is None
        assert db.session.query(Task).filter(Task.assigned_to_id == mia_id).count() == 0

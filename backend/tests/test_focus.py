from datetime import datetime, timedelta, timezone

import pytest

from app.api import focus as focus_api
from app.extensions import db
from app.models import FocusSession

PASSWORD = "parent-pass-123"


@pytest.fixture
def clock(monkeypatch):
    """The server's clock, which a test can move forward."""
    state = {"now": datetime(2026, 11, 20, 15, 0, tzinfo=timezone.utc)}
    monkeypatch.setattr(focus_api, "_now", lambda: state["now"])

    def move(**delta):
        state["now"] += timedelta(**delta)

    return move


def family(api, email="pat@example.test", kid="mia"):
    pat = api()
    assert pat.post("/auth/register", json={"display_name": "Pat", "email": email, "password": PASSWORD,
                                            "family_name": "The Testers"}).status_code == 201
    res = pat.post("/family/children", json={"display_name": kid.title(), "username": kid, "password": "kidpass1"})
    assert res.status_code == 201
    child = api()
    assert child.post("/auth/login", json={"identifier": kid, "password": "kidpass1"}).status_code == 200
    return pat, child, res.get_json()["child"]["id"]


def test_a_session_counts_only_once_its_time_is_really_up(api, clock):
    pat, mia, mia_id = family(api)
    res = mia.post("/focus", json={"minutes": 25, "label": "  Homework  "})
    assert res.status_code == 201
    active = res.get_json()["active"]
    assert active["label"] == "Homework" and active["minutes"] == 25
    assert active["ends_at"] == "2026-11-20T15:25:00Z" and res.get_json()["server_now"] == "2026-11-20T15:00:00Z"
    assert mia.post("/focus", json={"minutes": 10}).get_json()["error"] == "already_running"

    clock(minutes=20)
    early = mia.post(f"/focus/{active['id']}/finish")
    assert early.status_code == 409 and early.get_json()["error"] == "too_early"

    clock(minutes=4, seconds=50)  # a few seconds early is fine: the device's tick and the network
    done = mia.post(f"/focus/{active['id']}/finish").get_json()
    assert done["active"] is None and done["completed_count"] == 1 and done["total_minutes"] == 25
    assert len(done["new_badges"]) == 1  # the starter badge "First focus"
    assert mia.post(f"/focus/{active['id']}/finish").get_json()["error"] == "already_ended"

    # A parent can look at their kid's focus time, but not start a session for them.
    seen = pat.get(f"/focus?child_id={mia_id}").get_json()
    assert seen["total_minutes"] == 25 and seen["recent"][0]["status"] == "completed"
    assert pat.post("/focus", json={"minutes": 10}).status_code == 403
    assert pat.get("/focus").status_code == 400
    badges = {b["title"]: b for b in mia.get("/badges/progress").get_json()["badges"]}
    assert badges["First focus"]["earned_at"] and badges["Five hours of focus"]["progress"] == 25


def test_stopping_early_and_a_forgotten_session_dont_count(api, clock):
    _pat, mia, _ = family(api)
    first = mia.post("/focus", json={"minutes": 15}).get_json()["active"]
    stopped = mia.post(f"/focus/{first['id']}/cancel").get_json()
    assert stopped["active"] is None and stopped["completed_count"] == 0
    assert stopped["recent"][0]["status"] == "cancelled"

    mia.post("/focus", json={"minutes": 10})  # then the tab is closed
    clock(minutes=10 + 61)
    later = mia.get("/focus").get_json()
    assert later["active"] is None and [s["status"] for s in later["recent"]] == ["cancelled", "cancelled"]
    assert mia.post("/focus", json={"minutes": 10}).status_code == 201  # free to start again


def test_checks_what_is_sent_and_who_sends_it(api, clock):
    _pat, mia, _ = family(api)
    for minutes in (4, 121, "ten"):
        assert mia.post("/focus", json={"minutes": minutes}).status_code == 400
    assert mia.post("/focus", json={"minutes": 10, "label": "x" * 81}).status_code == 400

    other_parent, leo, leo_id = family(api, email="sam@example.test", kid="leo")
    session = leo.post("/focus", json={"minutes": 10}).get_json()["active"]
    assert mia.post(f"/focus/{session['id']}/cancel").status_code == 404  # someone else's session
    assert other_parent.get(f"/focus?child_id={leo_id}").status_code == 200
    assert _pat.get(f"/focus?child_id={leo_id}").status_code == 404  # another family's kid


def test_the_admin_can_switch_the_focus_timer_off(api, clock):
    admin = api()
    assert admin.post("/auth/setup", json={"display_name": "Alex", "email": "alex@example.test",
                                           "password": "admin-pass-1234"}).status_code == 201
    _pat, mia, _ = family(api)
    session = mia.post("/focus", json={"minutes": 10}).get_json()["active"]

    admin.put("/admin/settings", json={"features": {"focus_mode": False}})
    off = mia.get("/focus")
    assert off.status_code == 403 and off.get_json()["error"] == "feature_disabled"
    assert mia.post(f"/focus/{session['id']}/cancel").status_code == 403
    assert mia.get("/site/config").get_json()["features"]["focus_mode"] is False

    admin.put("/admin/settings", json={"features": {"focus_mode": True}})
    assert mia.get("/focus").get_json()["active"]["id"] == session["id"]


def test_focus_time_is_exported_and_removed_with_the_kid(api, app, clock):
    pat, mia, mia_id = family(api)
    session = mia.post("/focus", json={"minutes": 10, "label": "Piano"}).get_json()["active"]
    clock(minutes=10)
    mia.post(f"/focus/{session['id']}/finish")

    kid = pat.get("/family/export").get_json()["children"][0]
    assert kid["summary"]["focus_minutes"] == 10
    assert kid["focus_sessions"][0]["working_on"] == "Piano" and kid["focus_sessions"][0]["finished"] is True

    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.query(FocusSession).count() == 0

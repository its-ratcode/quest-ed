"""The task loop: a kid says "I did it", a parent approves (points) or sends it back."""
from app.extensions import db
from app.models import PointTransaction, User

PASSWORD = "parent-pass-123"


def setup_family(api, email="pat@example.test"):
    """A parent, a kid (Mia, signed in) and one 10-point task for her. Returns (parent, mia, task)."""
    pat = api()
    pat.post("/auth/register", json={"display_name": "Pat", "email": email, "password": PASSWORD,
                                     "family_name": "The Testers"})
    username = email.split("@")[0] + "-mia"
    mia_id = pat.post("/family/children", json={"display_name": "Mia", "username": username,
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    task = pat.post("/tasks", json={"title": "Tidy your room", "points": 10, "assigned_to_id": mia_id}).get_json()["task"]
    mia = api()
    mia.post("/auth/login", json={"identifier": username, "password": "kidpass1"})
    return pat, mia, task


def balance(client):
    return client.get("/auth/me").get_json()["user"]["points_balance"]


def test_i_did_it_then_approved_gives_the_points(api, app):
    pat, mia, task = setup_family(api)
    res = mia.post(f"/tasks/{task['id']}/submit", json={"note": "All done!"})
    assert res.status_code == 201
    assert res.get_json()["task"]["status"] == "submitted"
    assert res.get_json()["task"]["latest_submission"]["note"] == "All done!"

    waiting = pat.get("/tasks/submissions").get_json()["items"]
    assert len(waiting) == 1 and waiting[0]["task"]["title"] == "Tidy your room"
    assert waiting[0]["child"]["display_name"] == "Mia"

    ok = pat.post(f"/tasks/submissions/{waiting[0]['id']}/approve", json={"note": "Great job"})
    assert ok.status_code == 200 and ok.get_json()["balance"] == 10
    assert balance(mia) == 10
    assert mia.get(f"/tasks/{task['id']}").get_json()["task"]["status"] == "approved"
    assert pat.get("/tasks/submissions").get_json()["items"] == []  # nothing waiting now

    with app.app_context():  # the history explains the balance
        entry = db.session.query(PointTransaction).one()
        assert (entry.amount, entry.balance_after, entry.description) == (10, 10, "Completed: Tidy your room")


def test_sent_back_can_be_tried_again(api):
    pat, mia, task = setup_family(api)
    first = mia.post(f"/tasks/{task['id']}/submit", json={}).get_json()["submission"]
    back = pat.post(f"/tasks/submissions/{first['id']}/reject", json={"note": "The bed isn't made"})
    assert back.status_code == 200 and back.get_json()["submission"]["status"] == "rejected"

    again = mia.get(f"/tasks/{task['id']}").get_json()["task"]
    assert again["status"] == "open" and again["latest_submission"]["review_note"] == "The bed isn't made"
    assert balance(mia) == 0
    second = mia.post(f"/tasks/{task['id']}/submit", json={"note": "Bed made now"})
    assert second.status_code == 201


def test_points_are_given_once_even_on_a_double_click(api):
    pat, mia, task = setup_family(api)
    sub = mia.post(f"/tasks/{task['id']}/submit", json={}).get_json()["submission"]
    assert pat.post(f"/tasks/submissions/{sub['id']}/approve", json={}).status_code == 200
    assert pat.post(f"/tasks/submissions/{sub['id']}/approve", json={}).status_code == 409
    assert pat.post(f"/tasks/submissions/{sub['id']}/reject", json={}).status_code == 409
    assert balance(mia) == 10


def test_a_task_can_only_be_sent_while_its_to_do(api):
    pat, mia, task = setup_family(api)
    assert mia.post(f"/tasks/{task['id']}/submit", json={}).status_code == 201
    assert mia.post(f"/tasks/{task['id']}/submit", json={}).status_code == 409  # already waiting
    assert pat.delete(f"/tasks/{task['id']}").status_code == 409  # check it before archiving


def test_who_can_do_what(api):
    pat, mia, task = setup_family(api)
    assert pat.post(f"/tasks/{task['id']}/submit", json={}).status_code == 403  # parents don't send
    sub = mia.post(f"/tasks/{task['id']}/submit", json={}).get_json()["submission"]
    assert mia.post(f"/tasks/submissions/{sub['id']}/approve", json={}).status_code == 403  # kids don't approve

    sam, sams_kid, sams_task = setup_family(api, email="sam@example.test")
    assert sams_kid.post(f"/tasks/{task['id']}/submit", json={}).status_code == 404  # not their task
    assert sam.post(f"/tasks/submissions/{sub['id']}/approve", json={}).status_code == 404  # not their family
    assert sams_kid.get("/tasks/submissions").get_json()["items"] == []


def test_kids_see_their_own_balance_but_not_their_siblings(api):
    pat, mia, task = setup_family(api)
    pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo", "password": "kidpass1"})
    sub = mia.post(f"/tasks/{task['id']}/submit", json={}).get_json()["submission"]
    pat.post(f"/tasks/submissions/{sub['id']}/approve", json={})

    seen_by_mia = {m["display_name"]: m for m in mia.get("/family").get_json()["members"]}
    assert seen_by_mia["Mia"]["points_balance"] == 10
    assert "points_balance" not in seen_by_mia["Leo"]
    seen_by_pat = {m["display_name"]: m for m in pat.get("/family").get_json()["members"]}
    assert seen_by_pat["Leo"]["points_balance"] == 0


def test_removing_a_kid_removes_their_history_too(api, app):
    pat, mia, task = setup_family(api)
    sub = mia.post(f"/tasks/{task['id']}/submit", json={}).get_json()["submission"]
    pat.post(f"/tasks/submissions/{sub['id']}/approve", json={})
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.get(User, mia_id) is None
        assert db.session.query(PointTransaction).count() == 0

"""Deleting a whole family, and the log of important actions."""
import io
import json
import os

from app.extensions import db
from app.models import (
    AuditLog, Badge, Category, EarnedBadge, Family, PointTransaction, Redemption, Reward, Routine, SavingsGoal, Task,
    TaskSubmission, User,
)
from tests.test_approvals import PASSWORD, setup_family
from tests.test_photos import jpeg_with_location


def busy_family(api, email="pat@example.test"):
    """A family with a bit of everything: an approved task with a photo, a routine, a reward bought,
    a savings goal, badges, a second parent. Returns (pat, mia, mia_id)."""
    pat, mia, task = setup_family(api, email=email)
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    code = pat.get("/family").get_json()["family"]["invite_code"]
    api().post("/auth/register", json={"display_name": "Robin", "email": "robin-" + email, "password": PASSWORD,
                                      "invite_code": code})
    mia.upload(f"/tasks/{task['id']}/submit", {"note": "Done", "photo": (io.BytesIO(jpeg_with_location()), "room.jpg")})
    sub = pat.get("/tasks/submissions").get_json()["items"][0]
    pat.post(f"/tasks/submissions/{sub['id']}/approve", json={})
    pat.post("/routines", json={"title": "Brush teeth", "points": 2, "weekdays": [0], "assigned_to_id": mia_id})
    sticker = pat.post("/rewards", json={"title": "Sticker", "cost": 5}).get_json()["reward"]
    bike = pat.post("/rewards", json={"title": "Bike", "cost": 500}).get_json()["reward"]
    mia.post(f"/rewards/{sticker['id']}/redeem")
    mia.put(f"/rewards/{bike['id']}/goal")
    return pat, mia, mia_id


def counts(family_id=None):
    """How many rows each table has (for one family, where the table has one)."""
    out = {}
    for model in (Category, Task, Routine, Reward, Redemption, PointTransaction, SavingsGoal, Badge, EarnedBadge):
        query = db.session.query(model)
        out[model.__name__] = (query.filter(model.family_id == family_id) if family_id else query).count()
    return out


def test_deleting_the_family_removes_everyone_and_everything(api, app):
    pat, mia, _ = busy_family(api)
    sam, _, _ = busy_family(api, email="sam@example.test")  # another family, untouched
    with app.app_context():
        pat_family = db.session.query(User).filter_by(email="pat@example.test").one().family_id
        sam_family = db.session.query(User).filter_by(email="sam@example.test").one().family_id
        before_sam = counts(sam_family)
        photo_dir = app.config["UPLOAD_FOLDER"]
        photos_before = len(os.listdir(photo_dir))
    assert photos_before == 2

    res = pat.delete("/family", json={"password": "wrong"})
    assert res.status_code == 400 and "password" in res.get_json()["errors"]
    res = pat.delete("/family", json={"password": PASSWORD})
    assert res.status_code == 200 and res.get_json()["message"] == "Your family and all its data have been deleted."
    assert "access_token_cookie=;" in res.headers.get("Set-Cookie", "")  # signed out

    with app.app_context():
        assert db.session.get(Family, pat_family) is None
        assert db.session.query(User).filter_by(family_id=pat_family).count() == 0
        assert all(n == 0 for n in counts(pat_family).values())
        assert db.session.query(TaskSubmission).count() == 1  # only Sam's family's
        assert counts(sam_family) == before_sam
        assert len(os.listdir(photo_dir)) == 1  # Pat's family's photo is gone too
        log = db.session.query(AuditLog).filter_by(action="family.deleted").one()
        assert (log.actor_id, log.family_id, json.loads(log.details)) == (None, None, {"members": 3})
        assert db.session.query(AuditLog).filter(AuditLog.family_id == pat_family).count() == 0

    assert pat.get("/auth/me").status_code == 401
    assert api().post("/auth/login", json={"identifier": "pat-mia", "password": "kidpass1"}).status_code == 401
    assert sam.get("/family").status_code == 200


def test_only_parents_delete_a_family(api):
    pat, mia, _ = busy_family(api)
    assert mia.delete("/family", json={"password": "kidpass1"}).status_code == 403
    assert pat.delete("/family", json={}).status_code == 400
    assert api().delete("/family", json={"password": PASSWORD}).status_code == 401
    assert pat.get("/family").status_code == 200


def test_important_actions_are_logged_without_names(api, app):
    pat, mia, mia_id = busy_family(api)
    pat.patch(f"/family/children/{mia_id}", json={"password": "newpass1"})
    pat.post("/points/adjustments", json={"child_id": mia_id, "amount": 5, "reason": "Kind to her brother"})
    pending = mia.get("/rewards/redemptions?status=pending").get_json()["items"][0]
    pat.post(f"/rewards/redemptions/{pending['id']}/fulfill")
    kind = pat.post("/badges", json={"title": "Kind heart", "rule": "manual"}).get_json()["badge"]
    pat.post(f"/badges/{kind['id']}/award", json={"child_id": mia_id})
    pat.get("/family/export")

    with app.app_context():
        logs = db.session.query(AuditLog).order_by(AuditLog.id).all()
        actions = [log.action for log in logs]
        for action in ("account.registered", "auth.login", "child.created", "task.approved", "child.password_reset",
                       "points.adjusted", "reward.given", "badge.given", "family.exported"):
            assert action in actions, action
        adjusted = next(log for log in logs if log.action == "points.adjusted")
        assert json.loads(adjusted.details) == {"amount": 5}  # the reason (free text) isn't copied
        assert adjusted.to_dict()["actor"]["display_name"] == "Pat"
        everything = " ".join(log.details for log in logs)
        assert "Kind to her brother" not in everything and "Mia" not in everything


def test_removing_a_kid_removes_what_they_did_from_the_log(api, app):
    pat, mia, mia_id = busy_family(api)
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.query(AuditLog).filter_by(actor_id=mia_id).count() == 0
        removed = db.session.query(AuditLog).filter_by(action="child.deleted").one()
        assert (removed.target_id, removed.actor.display_name) == (mia_id, "Pat")
        assert db.session.query(SavingsGoal).count() == 0

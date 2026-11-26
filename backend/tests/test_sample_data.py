from sqlalchemy import func, select

from app.extensions import db
from app.models import EarnedBadge, Family, PointTransaction, Task, User
from app.services.routines import family_today
from app.services.sample_data import (
    ADMIN_EMAIL, ADMIN_PASSWORD, PARENT_EMAIL, PARENT_PASSWORD, SampleDataError, build_sample_family,
)

PASSWORD = "parent-pass-123"


def other_family(api, kid="sky"):
    """A family that has nothing to do with the sample one."""
    pat = api()
    assert pat.post("/auth/register", json={"display_name": "Pat", "email": "pat@example.test", "password": PASSWORD,
                                            "family_name": "The Testers"}).status_code == 201
    assert pat.post("/family/children", json={"display_name": "Kid", "username": kid,
                                              "password": "kidpass1"}).status_code == 201
    return pat


def test_builds_a_believable_family_and_resets_only_that(app, api):
    pat = other_family(api)
    with app.app_context():
        assert "created" in build_sample_family()
        assert "already there" in build_sample_family()  # a second run changes nothing

        sam = db.session.scalar(select(User).where(User.email == PARENT_EMAIL))
        kids = db.session.scalars(select(User).where(User.family_id == sam.family_id, User.role == "child")).all()
        assert sorted(k.username for k in kids) == ["leo", "mia", "zoe"]
        for kid in kids:  # every balance matches its history
            last = db.session.scalar(select(PointTransaction).where(PointTransaction.child_id == kid.id)
                                     .order_by(PointTransaction.created_at.desc(), PointTransaction.id.desc()))
            assert kid.points_balance >= 0 and last.balance_after == kid.points_balance
        assert db.session.scalar(select(func.count(EarnedBadge.id)).where(EarnedBadge.family_id == sam.family_id)) >= 3
        today = family_today(sam.family)
        assert db.session.scalar(select(func.count(Task.id)).where(  # today's routine tasks are there
            Task.family_id == sam.family_id, Task.occurrence_date == today)) >= 1
        assert "rebuilt" in build_sample_family(reset=True)
        # The old copy is gone, not doubled.
        assert db.session.scalar(select(func.count(Family.id)).where(Family.name == "The Rivera Family")) == 1
        assert db.session.scalar(select(func.count(User.id)).where(User.username.in_(["mia", "leo", "zoe"]))) == 3
        assert db.session.scalar(select(Family).where(Family.name == "The Testers")) is not None

    sam = api()
    assert sam.post("/auth/login", json={"identifier": PARENT_EMAIL, "password": PARENT_PASSWORD}).status_code == 200
    waiting = sam.get("/tasks/submissions").get_json()["items"]
    assert len(waiting) == 2  # Mia's piano and Leo's bird feeder wait for a parent
    assert pat.get("/auth/me").status_code == 200  # the other family still works

    admin = api()
    assert admin.post("/auth/login", json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).status_code == 200
    assert admin.get("/admin/stats").get_json()["families"] == 2


def test_refuses_when_a_sample_sign_in_is_taken(app, api):
    other_family(api, kid="mia")
    with app.app_context():
        try:
            build_sample_family()
        except SampleDataError as err:
            assert "mia" in str(err)
        else:
            raise AssertionError("expected SampleDataError")
        assert db.session.scalar(select(User.id).where(User.email == PARENT_EMAIL)) is None  # nothing half-made


def test_the_command_runs_but_never_in_production(app):
    runner = app.test_cli_runner()
    result = runner.invoke(args=["seed-demo"])
    assert result.exit_code == 0 and "Sample family created" in result.output

    app.config["APP_ENV"] = "production"
    result = runner.invoke(args=["seed-demo", "--reset"])
    assert result.exit_code != 0 and "can't be added in production" in result.output

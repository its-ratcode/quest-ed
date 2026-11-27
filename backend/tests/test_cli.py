from sqlalchemy import select

from app.extensions import db
from app.models import ROLE_ADMIN, AuditLog, User

GOOD = "a-long-admin-password"


def add_admin(app, *args):
    return app.test_cli_runner().invoke(args=["create-admin", *args])


def test_create_admin_adds_an_admin_who_can_sign_in(app, api):
    result = add_admin(app, "--email", " Root@Example.test ", "--name", "Robin", "--password", GOOD)
    assert result.exit_code == 0, result.output
    assert "root@example.test added" in result.output

    with app.app_context():
        admin = db.session.scalar(select(User).where(User.email == "root@example.test"))
        assert admin.role == ROLE_ADMIN and admin.display_name == "Robin"
        log = db.session.scalar(select(AuditLog).where(AuditLog.action == "site.admin_added"))
        assert log.target_id == admin.id

    res = api().post("/auth/login", json={"identifier": "root@example.test", "password": GOOD})
    assert res.status_code == 200


def test_create_admin_also_works_on_a_live_site(app):
    app.config["APP_ENV"] = "production"  # unlike the sample data, this is meant for real sites
    assert add_admin(app, "--email", "second@example.test", "--password", GOOD).exit_code == 0


def test_create_admin_refuses_bad_input(app):
    short = add_admin(app, "--email", "a@example.test", "--password", "too-short")
    assert short.exit_code != 0 and "at least 12 characters" in short.output

    bad_email = add_admin(app, "--email", "not-an-email", "--password", GOOD)
    assert bad_email.exit_code != 0 and "valid email" in bad_email.output

    assert add_admin(app, "--email", "taken@example.test", "--password", GOOD).exit_code == 0
    again = add_admin(app, "--email", "TAKEN@example.test", "--password", GOOD)
    assert again.exit_code != 0 and "already exists" in again.output

    with app.app_context():
        assert db.session.scalar(select(User.id).where(User.email == "a@example.test")) is None

"""Commands for whoever runs the site: `flask --app run <command>`."""
import click
from flask import current_app
from sqlalchemy import func, select

ADMIN_PASSWORD_MIN = 12  # the same rule as the first-run setup page


def register_cli(app):
    @app.cli.command("create-admin")
    @click.option("--email", prompt=True, help="The new administrator's sign-in email.")
    @click.option("--name", "display_name", default="Administrator", show_default=True,
                  help="The name shown in the app.")
    @click.password_option(help=f"At least {ADMIN_PASSWORD_MIN} characters. Asked for twice if left out.")
    def create_admin(email, display_name, password):
        """Add an administrator: a second one, or a way back in if the admin's password is lost.

        Works on a live site too (with Docker: docker compose exec api flask --app run create-admin).
        """
        from .core.validation import EMAIL_RE
        from .extensions import db
        from .models import ROLE_ADMIN, User
        from .services import audit

        email = email.strip().lower()
        display_name = display_name.strip() or "Administrator"
        if not EMAIL_RE.match(email):
            raise click.ClickException("Enter a valid email address.")
        if len(display_name) > 60:
            raise click.ClickException("Keep the name to 60 characters or fewer.")
        if len(password) < ADMIN_PASSWORD_MIN:
            raise click.ClickException(f"The password must be at least {ADMIN_PASSWORD_MIN} characters.")
        if db.session.scalar(select(User.id).where(func.lower(User.email) == email)):
            raise click.ClickException("An account with this email already exists.")

        admin = User(role=ROLE_ADMIN, email=email, display_name=display_name, avatar="🛡️")
        admin.set_password(password)
        db.session.add(admin)
        db.session.flush()
        audit.record("site.admin_added", actor=None, target_type="user", target_id=admin.id)
        db.session.commit()
        click.echo(f"Administrator {email} added. They can sign in now.")

    @app.cli.command("seed-demo")
    @click.option("--reset", is_flag=True,
                  help="Delete the sample family and sample admin first, then build them again. "
                       "Other families are not touched.")
    def seed_demo(reset):
        """Add the sample Rivera family with two weeks of history (sign-ins in app/services/sample_data.py)."""
        if current_app.config.get("APP_ENV") == "production":
            raise click.ClickException("Sample data can't be added in production.")
        from .services.sample_data import SampleDataError, build_sample_family

        try:
            click.echo(build_sample_family(reset=reset))
        except SampleDataError as err:
            raise click.ClickException(str(err)) from err

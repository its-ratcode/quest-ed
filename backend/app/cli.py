"""Commands for developers: `flask --app run <command>`."""
import click
from flask import current_app


def register_cli(app):
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

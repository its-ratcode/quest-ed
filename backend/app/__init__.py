"""Quest-Ed API: `create_app()` builds the Flask app."""
import os

from dotenv import load_dotenv
from flask import Flask, request
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import build_config
from .extensions import db, jwt, migrate

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app(config_name=None, overrides=None):
    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    config_name = config_name or os.environ.get("APP_ENV", "development")

    app = Flask(__name__, instance_path=os.path.join(BACKEND_DIR, "instance"))
    app.config.update(build_config(config_name))
    if overrides:
        app.config.update(overrides)

    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        os.makedirs(app.instance_path, exist_ok=True)
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(app.instance_path, "quest_ed.db")

    db.init_app(app)
    migrate.init_app(app, db, directory=os.path.join(BACKEND_DIR, "migrations"))
    jwt.init_app(app)
    from . import models  # noqa: F401  registers the tables with SQLAlchemy
    from .core import security  # noqa: F401  registers how session tokens map to users

    from .api import create_api_blueprint

    app.register_blueprint(create_api_blueprint(app.config["ENABLE_API_DOCS"]))

    from .cli import register_cli

    register_cli(app)

    @app.after_request
    def security_headers(response):
        """The API only sends JSON and photos, so it's locked down hard: nothing it returns may
        run scripts, be shown inside another site, or be read as a different kind of file.
        (The API docs page needs its scripts, so it doesn't get the strictest rule.)"""
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        if not request.path.startswith(("/api/v1/docs", "/swaggerui")):
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if app.config.get("JWT_COOKIE_SECURE"):  # only over HTTPS
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        return response

    # Behind a reverse proxy, trust its X-Forwarded-For so the sign-in limits see each
    # visitor's real address instead of the proxy's (set TRUSTED_PROXIES=1).
    proxies = app.config.get("TRUSTED_PROXIES", 0)
    if proxies:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxies, x_proto=proxies, x_host=proxies)

    # Real databases are built by migrations (`flask --app run db upgrade`).
    # Tests use a throwaway in-memory database made straight from the models.
    if app.config.get("TESTING"):
        with app.app_context():
            db.create_all()

    return app

"""Quest-Ed API: `create_app()` builds the Flask app."""
import os

from dotenv import load_dotenv
from flask import Flask

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

    # Real databases are built by migrations (`flask --app run db upgrade`).
    # Tests use a throwaway in-memory database made straight from the models.
    if app.config.get("TESTING"):
        with app.app_context():
            db.create_all()

    return app

"""Quest-Ed API: `create_app()` builds the Flask app."""
import os

from dotenv import load_dotenv
from flask import Flask

from .config import build_config

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app(config_name=None, overrides=None):
    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    config_name = config_name or os.environ.get("APP_ENV", "development")

    app = Flask(__name__, instance_path=os.path.join(BACKEND_DIR, "instance"))
    app.config.update(build_config(config_name))
    if overrides:
        app.config.update(overrides)

    from .api import create_api_blueprint

    app.register_blueprint(create_api_blueprint(app.config["ENABLE_API_DOCS"]))
    return app

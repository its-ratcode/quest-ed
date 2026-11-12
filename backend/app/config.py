"""Configuration, read from environment variables when the app is created.

Reading at creation time (not import time) means a `.env` file loaded by
`create_app` is always respected.
"""
import os

DEV_SECRET = "dev-only-secret-key-change-me-0123456789abcdef"


def _bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def build_config(env_name):
    """Settings for "development" (default), "testing" or "production"."""
    env_name = (env_name or "development").lower()
    config = {
        "APP_ENV": env_name,
        "SECRET_KEY": os.environ.get("SECRET_KEY", DEV_SECRET),
        "ENABLE_API_DOCS": True,
        "RESTX_MASK_SWAGGER": False,
        "RESTX_ERROR_404_HELP": False,
    }

    if env_name == "testing":
        config.update(TESTING=True, ENABLE_API_DOCS=False)
    elif env_name == "production":
        if not os.environ.get("SECRET_KEY"):
            raise RuntimeError("Production requires the SECRET_KEY environment variable.")
        config.update(ENABLE_API_DOCS=_bool("ENABLE_API_DOCS", False))
    return config

"""Configuration, read from environment variables when the app is created.

Reading at creation time (not import time) means a `.env` file loaded by
`create_app` is always respected.
"""
import os
from datetime import timedelta

DEV_SECRET = "dev-only-secret-key-change-me-0123456789abcdef"
DEV_JWT_SECRET = "dev-only-jwt-secret-change-me-0123456789abcdef"


def _bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name, default):
    value = os.environ.get(name)
    return int(value) if value and value.strip().isdigit() else default


def build_config(env_name):
    """Settings for "development" (default), "testing" or "production"."""
    env_name = (env_name or "development").lower()
    config = {
        "APP_ENV": env_name,
        "SECRET_KEY": os.environ.get("SECRET_KEY", DEV_SECRET),
        "JWT_SECRET_KEY": os.environ.get("JWT_SECRET_KEY", DEV_JWT_SECRET),
        # Empty means a SQLite file in backend/instance/ (see create_app).
        "SQLALCHEMY_DATABASE_URI": os.environ.get("DATABASE_URL"),
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        # Sessions live only in HttpOnly cookies that page scripts can't read. Requests
        # that change something must also send the CSRF cookie's value in a header.
        "JWT_TOKEN_LOCATION": ["cookies"],
        "JWT_COOKIE_SECURE": _bool("JWT_COOKIE_SECURE", False),
        "JWT_COOKIE_SAMESITE": "Lax",
        "JWT_COOKIE_CSRF_PROTECT": True,
        "JWT_SESSION_COOKIE": False,  # stay signed in after the browser closes
        "JWT_ACCESS_TOKEN_EXPIRES": timedelta(minutes=_int("ACCESS_TOKEN_MINUTES", 15)),
        "JWT_REFRESH_TOKEN_EXPIRES": timedelta(days=_int("REFRESH_TOKEN_DAYS", 30)),
        "JWT_REFRESH_COOKIE_PATH": "/api/v1/auth/",
        "ENABLE_API_DOCS": True,
        "RESTX_MASK_SWAGGER": False,
        "RESTX_ERROR_404_HELP": False,
    }

    if env_name == "testing":
        config.update(TESTING=True, ENABLE_API_DOCS=False, SQLALCHEMY_DATABASE_URI="sqlite:///:memory:")
    elif env_name == "production":
        missing = [key for key in ("SECRET_KEY", "JWT_SECRET_KEY") if not os.environ.get(key)]
        if missing:
            raise RuntimeError(f"Production requires these environment variables: {', '.join(missing)}")
        config.update(JWT_COOKIE_SECURE=True, ENABLE_API_DOCS=_bool("ENABLE_API_DOCS", False))
    return config

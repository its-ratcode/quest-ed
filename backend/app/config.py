"""Configuration, read from environment variables when the app is created.

Reading at creation time (not import time) means a `.env` file loaded by
`create_app` is always respected.
"""
import json
import os
import secrets
import tempfile
from datetime import timedelta

DEV_SECRET = "dev-only-secret-key-change-me-0123456789abcdef"
DEV_JWT_SECRET = "dev-only-jwt-secret-change-me-0123456789abcdef"
SECRET_NAMES = ("SECRET_KEY", "JWT_SECRET_KEY")


def _stored_secrets(path):
    """The secrets kept in the file at `path`, made with random values the first time.

    The Docker image points SECRETS_FILE into its data volume, so a new install works
    without anyone making secrets by hand, and they stay the same across restarts.
    Only the owner can read the file.
    """
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    values = {name: secrets.token_urlsafe(48) for name in SECRET_NAMES}
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(values, f)
    return values


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
        # Task photos are at most 5 MB; anything much bigger is refused before it's read.
        "MAX_CONTENT_LENGTH": 6 * 1024 * 1024,
        # Where task photos are kept. Empty means backend/instance/uploads.
        "UPLOAD_FOLDER": os.environ.get("UPLOAD_FOLDER"),
        "ENABLE_API_DOCS": True,
        # Limits on wrong passwords (see app/core/limits.py). Only switch off for local experiments.
        "RATE_LIMIT_ENABLED": _bool("RATE_LIMIT_ENABLED", True),
        # How many reverse proxies (Caddy, nginx…) sit in front of the API; 0 = none. With one,
        # the sign-in limits see each visitor's real address instead of the proxy's.
        "TRUSTED_PROXIES": _int("TRUSTED_PROXIES", 0),
        "RESTX_MASK_SWAGGER": False,
        "RESTX_ERROR_404_HELP": False,
    }

    if env_name == "testing":
        # Photos go to a throwaway folder (the test fixture removes it).
        config.update(TESTING=True, ENABLE_API_DOCS=False, SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
                      UPLOAD_FOLDER=tempfile.mkdtemp(prefix="quest-ed-test-"))
    elif env_name == "production":
        # Secrets set in the environment win; otherwise they come from SECRETS_FILE, if set.
        secrets_file = os.environ.get("SECRETS_FILE")
        stored = {}
        if secrets_file and not all(os.environ.get(name) for name in SECRET_NAMES):
            stored = _stored_secrets(secrets_file)
        values = {name: os.environ.get(name) or stored.get(name) for name in SECRET_NAMES}
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise RuntimeError(f"Production requires these environment variables: {', '.join(missing)}")
        config.update(values)
        config.update(JWT_COOKIE_SECURE=True, ENABLE_API_DOCS=_bool("ENABLE_API_DOCS", False))
    return config

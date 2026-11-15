import pure_sqlalchemy  # noqa: F401  see backend/pure_sqlalchemy.py
import pytest

from app import create_app
from app.extensions import db

API = "/api/v1"


class ApiClient:
    """A test browser for the API: keeps cookies, and sends the CSRF header the
    way the web app does (copied from the readable csrf_* cookie)."""

    def __init__(self, client):
        self.raw = client

    def _headers(self, path):
        cookie = "csrf_refresh_token" if path.endswith(("/auth/refresh", "/auth/logout")) else "csrf_access_token"
        token = self.raw.get_cookie(cookie)
        return {"X-CSRF-TOKEN": token.value} if token else {}

    def get(self, path, **kwargs):
        return self.raw.get(API + path, **kwargs)

    def post(self, path, json=None):
        return self.raw.post(API + path, json=json, headers=self._headers(API + path))

    def patch(self, path, json=None):
        return self.raw.patch(API + path, json=json, headers=self._headers(API + path))


@pytest.fixture
def app():
    application = create_app("testing")
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def api(app):
    """A fresh API client (a new "browser" each time it's called)."""
    return lambda: ApiClient(app.test_client())


@pytest.fixture
def session(app):
    """The database session, inside an app context."""
    with app.app_context():
        yield db.session

import shutil

import pure_sqlalchemy  # noqa: F401  see backend/pure_sqlalchemy.py
import pytest

from app import create_app
from app.core import limits
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

    def upload(self, path, data):
        """Send form data with files, like the web app's photo upload."""
        return self.raw.post(API + path, data=data, content_type="multipart/form-data",
                             headers=self._headers(API + path))

    def put(self, path, json=None):
        return self.raw.put(API + path, json=json, headers=self._headers(API + path))

    def patch(self, path, json=None):
        return self.raw.patch(API + path, json=json, headers=self._headers(API + path))

    def delete(self, path, json=None):
        return self.raw.delete(API + path, json=json, headers=self._headers(API + path))


@pytest.fixture
def app():
    limits.reset()  # every test starts with no wrong passwords counted
    application = create_app("testing")
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()
    shutil.rmtree(application.config["UPLOAD_FOLDER"], ignore_errors=True)


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

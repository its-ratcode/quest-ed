import pure_sqlalchemy  # noqa: F401  see backend/pure_sqlalchemy.py
import pytest

from app import create_app
from app.extensions import db


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
def session(app):
    """The database session, inside an app context."""
    with app.app_context():
        yield db.session

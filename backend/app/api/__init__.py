"""Every API route lives under /api/v1, one namespace per area."""
from flask import Blueprint
from flask_jwt_extended.exceptions import (
    CSRFError,
    JWTExtendedException,
    NoAuthorizationError,
    RevokedTokenError,
    UserLookupError,
)
from flask_restx import Api
from jwt.exceptions import ExpiredSignatureError, PyJWTError


def create_api_blueprint(enable_docs=True):
    blueprint = Blueprint("api", __name__, url_prefix="/api/v1")
    api = Api(
        blueprint,
        title="Quest-Ed API",
        version="1.0",
        description="Tasks, approvals, points and rewards for families.",
        doc="/docs" if enable_docs else False,
    )

    @api.errorhandler(JWTExtendedException)
    @api.errorhandler(PyJWTError)
    def handle_auth_error(error):
        """Every session problem is a 401 with a plain message and a code the web app can act on."""
        if isinstance(error, ExpiredSignatureError):
            return {"message": "Your session has expired.", "error": "token_expired"}, 401
        if isinstance(error, CSRFError):
            return {"message": "Security check failed. Please refresh the page.", "error": "csrf_failed"}, 401
        if isinstance(error, RevokedTokenError):
            return {"message": "This session has ended. Please sign in again.", "error": "token_revoked"}, 401
        if isinstance(error, UserLookupError):
            return {"message": "This account is not available.", "error": "account_unavailable"}, 401
        if isinstance(error, NoAuthorizationError):
            return {"message": "Please sign in to continue.", "error": "unauthorized"}, 401
        return {"message": "Your session is not valid. Please sign in again.", "error": "invalid_token"}, 401

    from .auth import ns as auth_ns
    from .categories import ns as categories_ns
    from .family import ns as family_ns
    from .health import ns as health_ns
    from .tasks import ns as tasks_ns

    api.add_namespace(health_ns, path="/health")
    api.add_namespace(auth_ns, path="/auth")
    api.add_namespace(family_ns, path="/family")
    api.add_namespace(categories_ns, path="/categories")
    api.add_namespace(tasks_ns, path="/tasks")
    return blueprint

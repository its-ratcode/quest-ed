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
from werkzeug.exceptions import RequestEntityTooLarge

from ..services.photos import TOO_BIG


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

    @api.errorhandler(RequestEntityTooLarge)
    def handle_too_large(error):
        """Only photos are big enough to hit the size limit (MAX_CONTENT_LENGTH)."""
        return {"message": TOO_BIG, "errors": {"photo": TOO_BIG}}, 413

    from .admin import ns as admin_ns
    from .auth import ns as auth_ns
    from .badges import ns as badges_ns
    from .categories import ns as categories_ns
    from .dashboard import ns as dashboard_ns
    from .family import ns as family_ns
    from .focus import ns as focus_ns
    from .health import ns as health_ns
    from .points import ns as points_ns
    from .rewards import ns as rewards_ns
    from .routines import ns as routines_ns
    from .site import ns as site_ns
    from .tasks import ns as tasks_ns

    api.add_namespace(health_ns, path="/health")
    api.add_namespace(site_ns, path="/site")
    api.add_namespace(auth_ns, path="/auth")
    api.add_namespace(family_ns, path="/family")
    api.add_namespace(categories_ns, path="/categories")
    api.add_namespace(tasks_ns, path="/tasks")
    api.add_namespace(routines_ns, path="/routines")
    api.add_namespace(badges_ns, path="/badges")
    api.add_namespace(focus_ns, path="/focus")
    api.add_namespace(dashboard_ns, path="/dashboard")
    api.add_namespace(points_ns, path="/points")
    api.add_namespace(rewards_ns, path="/rewards")
    api.add_namespace(admin_ns, path="/admin")
    return blueprint

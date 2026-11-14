"""Who is signed in, and what they may do.

The callbacks below teach flask-jwt-extended how to turn a session token into a
User (and refuse ended sessions). `roles_required` protects routes by role.
"""
from functools import wraps

from flask_jwt_extended import current_user, verify_jwt_in_request
from flask_restx import abort
from sqlalchemy import select

from ..extensions import db, jwt
from ..models import TokenBlocklist, User


@jwt.user_identity_loader
def _user_identity(user):
    return str(user.id if isinstance(user, User) else user)


@jwt.user_lookup_loader
def _user_lookup(_header, payload):
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        return None  # flask-jwt-extended then answers 401
    return user


@jwt.token_in_blocklist_loader
def _token_revoked(_header, payload):
    jti = payload.get("jti")
    return db.session.scalar(select(TokenBlocklist.id).where(TokenBlocklist.jti == jti)) is not None


def roles_required(*roles):
    """Require a signed-in user with one of the given roles."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            if current_user.role not in roles:
                abort(403, "You don't have permission to do that.")
            return fn(*args, **kwargs)

        return wrapper

    return decorator

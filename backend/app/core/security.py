"""Who is signed in, and what they may do.

The callbacks below teach flask-jwt-extended how to turn a session token into a
User (and refuse ended sessions). `roles_required` protects routes by role.
"""
from functools import wraps

from flask_jwt_extended import current_user, verify_jwt_in_request
from flask_restx import abort
from sqlalchemy import select

from ..extensions import db, jwt
from ..models import ROLE_CHILD, TokenBlocklist, User


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


def family_child_or_404(child_id):
    """A kid in the signed-in person's family. Kids of other families are reported as
    not found (not "forbidden"), so nobody can find out which accounts exist."""
    child = db.session.get(User, child_id)
    if (child is None or child.role != ROLE_CHILD or current_user.family_id is None
            or child.family_id != current_user.family_id):
        abort(404, "Child not found.")
    return child


def confirm_password(user, password, field="password"):
    """Check a parent's password before something that can't be undone.
    Wrong: 400 with a message on the field."""
    if not password or not user.check_password(password):
        abort(400, "Please check the highlighted fields.", errors={field: "That password isn't right."})

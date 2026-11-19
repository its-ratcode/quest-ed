"""Who is signed in, and what they may do.

The callbacks below teach flask-jwt-extended how to turn a session token into a
User (and refuse ended sessions). `roles_required` protects routes by role.
"""
from functools import wraps

from flask_jwt_extended import current_user, verify_jwt_in_request
from flask_restx import abort
from sqlalchemy import select, update

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


def family_object_or_404(model, obj_id, label):
    """Something (a task, a reward…) that belongs to the signed-in person's family.
    Other families' things are reported as not found, so their existence isn't revealed."""
    obj = db.session.get(model, obj_id)
    if obj is None or current_user.family_id is None or obj.family_id != current_user.family_id:
        abort(404, f"{label} not found.")
    return obj


def children_for_new_item(p):
    """Who a new task is for: "assigned_to_ids": [ids] (one copy each) or "assigned_to_id": id.
    Call before p.validate(); returns the kids, or [] after adding a field error."""
    ids = p.data.get("assigned_to_ids")
    if ids is None:
        single = p.integer("assigned_to_id")
        return [family_child_or_404(single)] if single is not None else []
    if (not isinstance(ids, list) or not ids or len(ids) > 30
            or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids)):
        p.add_error("assigned_to_ids", "Choose at least one child.")
        return []
    return [family_child_or_404(i) for i in dict.fromkeys(ids)]  # each kid once, in order


def family_child_or_404(child_id):
    """A kid in the signed-in person's family. Kids of other families are reported as
    not found (not "forbidden"), so nobody can find out which accounts exist."""
    child = db.session.get(User, child_id)
    if (child is None or child.role != ROLE_CHILD or current_user.family_id is None
            or child.family_id != current_user.family_id):
        abort(404, "Child not found.")
    return child


def transition(model, obj_id, from_status, **values):
    """Move a row from one status to the next in a single step. Returns False when it was no
    longer in `from_status`, for example because a second click or another parent got there
    first, so nothing happens twice."""
    result = db.session.execute(
        update(model).where(model.id == obj_id, model.status == from_status).values(**values)
    )
    return result.rowcount == 1


def confirm_password(user, password, field="password"):
    """Check a parent's password before something that can't be undone.
    Wrong: 400 with a message on the field."""
    if not password or not user.check_password(password):
        abort(400, "Please check the highlighted fields.", errors={field: "That password isn't right."})

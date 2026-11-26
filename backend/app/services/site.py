"""Site-wide settings the administrator switches on and off, and the notices people see."""
import json
from functools import wraps

from flask_restx import abort
from sqlalchemy import or_, select

from ..extensions import db
from ..models import ROLE_ADMIN, ROLE_CHILD, ROLE_PARENT, Notice, SiteSetting, User, utcnow

# Every switch, with its value on a new site and the label on the Site settings page.
DEFAULT_FEATURES = {"registration": True, "focus_mode": True, "leaderboard": True}
FEATURE_LABELS = {"registration": "New parent sign-ups", "focus_mode": "Focus timer",
                  "leaderboard": "Family leaderboards"}


def needs_setup():
    """True on a brand-new site, before anyone has created the administrator."""
    return db.session.scalar(select(User.id).where(User.role == ROLE_ADMIN).limit(1)) is None


def get_features():
    row = db.session.get(SiteSetting, "features")
    stored = json.loads(row.value) if row else {}
    return {key: bool(stored.get(key, default)) for key, default in DEFAULT_FEATURES.items()}


def set_features(changes):
    """Save new values for some switches (unknown names are ignored); returns all of them."""
    features = get_features()
    features.update({k: bool(v) for k, v in changes.items() if k in DEFAULT_FEATURES})
    row = db.session.get(SiteSetting, "features")
    if row is None:
        row = SiteSetting(key="features", value="{}")
        db.session.add(row)
    row.value = json.dumps(features, sort_keys=True)
    return features


def feature_enabled(name):
    return get_features().get(name, False)


def require_feature(name):
    """For an endpoint that belongs to a switch: while it's off, the endpoint answers 403."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not feature_enabled(name):
                abort(403, "This is turned off on this site.", error="feature_disabled")
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def notices_for(user, limit=5):
    """The notices showing now for this person: for everyone, or for their role.
    The administrator sees all of them, to check how they look."""
    audiences = {ROLE_PARENT: ["all", "parents"], ROLE_CHILD: ["all", "children"]}.get(
        user.role, ["all", "parents", "children"])
    return db.session.scalars(
        select(Notice)
        .where(Notice.is_active.is_(True), Notice.audience.in_(audiences),
               or_(Notice.expires_at.is_(None), Notice.expires_at > utcnow()))
        .order_by(Notice.created_at.desc(), Notice.id.desc())
        .limit(limit)
    ).all()

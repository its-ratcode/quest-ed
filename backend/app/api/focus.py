"""The focus timer: a kid sets a timer and works on one thing until it rings.

The server keeps the time. A session only counts once its time is really up on the server's
clock, so changing the device's clock or calling "finish" early doesn't help.
"""
from datetime import datetime, timedelta, timezone

from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..core.security import family_child_or_404, family_object_or_404, roles_required
from ..core.validation import Payload, query_int
from ..extensions import db
from ..models import FOCUS_ACTIVE, FOCUS_CANCELLED, FOCUS_COMPLETED, ROLE_CHILD, ROLE_PARENT, FocusSession, iso
from ..services import badges
from ..services.site import require_feature

ns = Namespace("focus", description="The kids' focus timer")

MIN_MINUTES, MAX_MINUTES = 5, 120
GRACE_SECONDS = 15  # "finish" may arrive this much early (the device's tick and the network)
FORGOTTEN_AFTER = timedelta(hours=1)  # a session this long past its end (tab closed) is cancelled


def _now():
    """The current time. Tests replace this to move the clock."""
    return datetime.now(timezone.utc)


def _which_child():
    """Kids see their own timer. Parents look at a kid of their family with ?child_id=."""
    if current_user.role == ROLE_CHILD:
        return current_user
    child_id = query_int("child_id")
    if child_id is None:
        abort(400, "child_id is required.")
    return family_child_or_404(child_id)


def _close_forgotten(child):
    """A session nobody finished (the tab was closed) doesn't run forever: it's cancelled."""
    for session in db.session.scalars(select(FocusSession).where(
            FocusSession.child_id == child.id, FocusSession.status == FOCUS_ACTIVE)):
        if _now() > session.ends_at() + FORGOTTEN_AFTER:
            session.status = FOCUS_CANCELLED
            session.ended_at = _now()
    db.session.commit()


def _state(child):
    """The running session (if any), the last ten, the totals, and the server's time
    (so the web app can count down correctly even if the device's clock is wrong)."""
    _close_forgotten(child)
    active = db.session.scalar(select(FocusSession).where(
        FocusSession.child_id == child.id, FocusSession.status == FOCUS_ACTIVE))
    recent = db.session.scalars(
        select(FocusSession).where(FocusSession.child_id == child.id, FocusSession.status != FOCUS_ACTIVE)
        .order_by(FocusSession.started_at.desc(), FocusSession.id.desc()).limit(10)).all()
    count, minutes = db.session.execute(
        select(func.count(FocusSession.id), func.coalesce(func.sum(FocusSession.minutes), 0))
        .where(FocusSession.child_id == child.id, FocusSession.status == FOCUS_COMPLETED)).one()
    return {
        "active": active.to_dict() if active else None,
        "recent": [s.to_dict() for s in recent],
        "completed_count": int(count),
        "total_minutes": int(minutes),
        "server_now": iso(_now()),
    }


def _own_running_session(session_id):
    session = family_object_or_404(FocusSession, session_id, "Focus session")
    if session.child_id != current_user.id:
        abort(404, "Focus session not found.")
    if session.status != FOCUS_ACTIVE:
        abort(409, "This session has already ended.", error="already_ended")
    return session


@ns.route("")
class Focus(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    @require_feature("focus_mode")
    def get(self):
        """The running session, the last ten, and the totals."""
        return _state(_which_child())

    @roles_required(ROLE_CHILD)
    @require_feature("focus_mode")
    def post(self):
        """Start a session: {minutes (5–120), label (optional)}."""
        p = Payload()
        minutes = p.integer("minutes", min_value=MIN_MINUTES, max_value=MAX_MINUTES)
        label = p.string("label", required=False, max_len=80, default="")
        p.validate()
        _close_forgotten(current_user)
        db.session.add(FocusSession(family_id=current_user.family_id, child_id=current_user.id, minutes=minutes,
                                    label=label or "", started_at=_now()))
        try:
            db.session.commit()
        except IntegrityError:  # one is running already (maybe started a moment ago in another tab)
            db.session.rollback()
            abort(409, "You already have a focus session running.", error="already_running")
        return _state(current_user), 201


@ns.route("/<int:session_id>/finish")
class FocusFinish(Resource):
    @roles_required(ROLE_CHILD)
    @require_feature("focus_mode")
    def post(self, session_id):
        """The time is up: the session counts. Refused while there's still time left."""
        session = _own_running_session(session_id)
        seconds_left = (session.ends_at() - _now()).total_seconds()
        if seconds_left > GRACE_SECONDS:
            abort(409, "There's still time left on this session.", error="too_early",
                  seconds_left=int(seconds_left))
        session.status = FOCUS_COMPLETED
        session.ended_at = _now()
        db.session.commit()
        new_badges = badges.evaluate(current_user)
        return dict(_state(current_user), new_badges=new_badges)


@ns.route("/<int:session_id>/cancel")
class FocusCancel(Resource):
    @roles_required(ROLE_CHILD)
    @require_feature("focus_mode")
    def post(self, session_id):
        """Stop early. The session is kept but doesn't count."""
        session = _own_running_session(session_id)
        session.status = FOCUS_CANCELLED
        session.ended_at = _now()
        db.session.commit()
        return _state(current_user)

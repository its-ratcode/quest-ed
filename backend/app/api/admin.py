"""Running the site: accounts, site settings, notices and the action log. Administrators only."""
from datetime import datetime, timezone

from flask import request
from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, or_, select

from ..core.security import roles_required
from ..core.validation import Payload, query_int
from ..extensions import db
from ..models import (
    NOTICE_AUDIENCES, NOTICE_LEVELS, ROLE_ADMIN, ROLE_PARENT, ROLES, SUBMISSION_APPROVED, AuditLog, Family, Notice,
    Redemption, Task, TaskSubmission, User, iso,
)
from ..services import audit
from ..services.site import FEATURE_LABELS, get_features, set_features

ns = Namespace("admin", description="Running the site (administrators only)")


def _count(stmt):
    return db.session.scalar(stmt) or 0


def _page():
    return query_int("page", default=1, min_value=1), query_int("per_page", default=25, min_value=5, max_value=100)


def _paged(stmt, order_by, page, per_page):
    """One page of `stmt`, and how many there are in all."""
    total = _count(select(func.count()).select_from(stmt.subquery()))
    rows = db.session.scalars(stmt.order_by(*order_by).limit(per_page).offset((page - 1) * per_page)).all()
    return rows, total


@ns.route("/stats")
class Stats(Resource):
    @roles_required(ROLE_ADMIN)
    def get(self):
        """Counts for the whole site."""
        by_role = dict(db.session.execute(select(User.role, func.count(User.id)).group_by(User.role)).all())
        return {
            "users": {role: by_role.get(role, 0) for role in ROLES},
            "inactive_users": _count(select(func.count(User.id)).where(User.is_active.is_(False))),
            "families": _count(select(func.count(Family.id))),
            "tasks": _count(select(func.count(Task.id))),
            "approved_submissions": _count(
                select(func.count(TaskSubmission.id)).where(TaskSubmission.status == SUBMISSION_APPROVED)),
            "redemptions": _count(select(func.count(Redemption.id))),
        }


@ns.route("/users")
class Users(Resource):
    @roles_required(ROLE_ADMIN)
    def get(self):
        """Every account, newest first. Search with ?q= (name, email or username), and filter
        with ?role= and ?status=active|inactive."""
        page, per_page = _page()
        stmt = select(User)
        q = (request.args.get("q") or "").strip().lower()
        if q:
            stmt = stmt.where(or_(func.lower(User.display_name).contains(q, autoescape=True),
                                  func.lower(User.email).contains(q, autoescape=True),
                                  User.username.contains(q, autoescape=True)))
        role = request.args.get("role")
        if role in ROLES:
            stmt = stmt.where(User.role == role)
        status = request.args.get("status")
        if status in ("active", "inactive"):
            stmt = stmt.where(User.is_active.is_(status == "active"))
        users, total = _paged(stmt, (User.created_at.desc(), User.id.desc()), page, per_page)

        family_ids = {u.family_id for u in users if u.family_id}
        names = dict(db.session.execute(select(Family.id, Family.name).where(Family.id.in_(family_ids))).all())
        items = [dict(u.to_dict(private=True), family_name=names.get(u.family_id), last_login_at=iso(u.last_login_at))
                 for u in users]
        return {"items": items, "total": total, "page": page, "per_page": per_page}


@ns.route("/users/<int:user_id>")
class UserResource(Resource):
    @roles_required(ROLE_ADMIN)
    def patch(self, user_id):
        """Switch an account off or back on ({is_active}), or set a new password for a parent
        who forgot theirs ({password}). Kids' passwords are reset by their parents."""
        user = db.session.get(User, user_id)
        if user is None:
            abort(404, "User not found.")
        p = Payload()
        if p.has("password"):
            password = p.password("password", min_len=8)
            p.validate()
            if user.role != ROLE_PARENT:
                abort(409, "Only a parent's password can be set here. Kids' passwords are reset by their parents, "
                           "and you change your own on your profile.")
            user.set_password(password)
            audit.record("user.password_set", actor=current_user, target_type="user", target_id=user.id,
                         family_id=user.family_id)
            db.session.commit()
            return {"user": user.to_dict(private=True)}

        is_active = p.boolean("is_active", required=True)
        p.validate()
        if user.id == current_user.id:
            abort(409, "You can't switch off your own account.")
        if user.is_active != is_active:
            # A switched-off account can't sign in, and its open sessions stop working at once.
            user.is_active = is_active
            audit.record("user.activated" if is_active else "user.deactivated", actor=current_user,
                         target_type="user", target_id=user.id, family_id=user.family_id, role=user.role)
            db.session.commit()
        return {"user": user.to_dict(private=True)}


@ns.route("/settings")
class Settings(Resource):
    @roles_required(ROLE_ADMIN)
    def get(self):
        """The site switches, with their labels."""
        return {"features": get_features(), "labels": FEATURE_LABELS}

    @roles_required(ROLE_ADMIN)
    def put(self):
        """Change some switches: {"features": {"registration": false}}."""
        changes = (request.get_json(silent=True) or {}).get("features")
        if not isinstance(changes, dict) or not changes or not all(isinstance(v, bool) for v in changes.values()):
            abort(400, 'Send {"features": {"name": true or false}}.')
        unknown = sorted(set(changes) - set(FEATURE_LABELS))
        if unknown:
            abort(400, f"Unknown setting: {', '.join(unknown)}.")
        before = get_features()
        after = set_features(changes)
        changed = {k: v for k, v in after.items() if v != before[k]}
        if changed:
            audit.record("settings.changed", actor=current_user, **changed)
        db.session.commit()
        return {"features": after, "labels": FEATURE_LABELS}


@ns.route("/audit-logs")
class AuditLogs(Resource):
    @roles_required(ROLE_ADMIN)
    def get(self):
        """Recorded actions, newest first. ?action= keeps those starting with it ("task." for all task ones)."""
        page, per_page = _page()
        stmt = select(AuditLog)
        action = (request.args.get("action") or "").strip()
        if action:
            stmt = stmt.where(AuditLog.action.startswith(action, autoescape=True))
        logs, total = _paged(stmt, (AuditLog.created_at.desc(), AuditLog.id.desc()), page, per_page)
        return {"items": [log.to_dict() for log in logs], "total": total, "page": page, "per_page": per_page}


@ns.route("/notices")
class AdminNotices(Resource):
    @roles_required(ROLE_ADMIN)
    def get(self):
        """The latest notices, including ones taken down or past their end date."""
        notices = db.session.scalars(select(Notice).order_by(Notice.created_at.desc(), Notice.id.desc()).limit(100))
        return {"items": [n.to_dict() for n in notices]}

    @roles_required(ROLE_ADMIN)
    def post(self):
        """Show a banner to everyone, parents or kids ({message, level, audience, expires_on}).
        It shows until the end of expires_on (UTC), or until it's taken down."""
        p = Payload()
        message = p.string("message", max_len=300)
        level = p.choice("level", NOTICE_LEVELS, required=False, default="info")
        audience = p.choice("audience", NOTICE_AUDIENCES, required=False, default="all")
        expires_on = p.date("expires_on")
        p.validate()
        expires_at = None
        if expires_on:
            expires_at = datetime(expires_on.year, expires_on.month, expires_on.day, 23, 59, 59, tzinfo=timezone.utc)
            if expires_at <= datetime.now(timezone.utc):
                p.add_error("expires_on", "Choose today or a later day.")
                p.validate()
        notice = Notice(message=message, level=level, audience=audience, expires_at=expires_at,
                        created_by_id=current_user.id)
        db.session.add(notice)
        db.session.flush()
        audit.record("notice.created", actor=current_user, target_type="notice", target_id=notice.id,
                     audience=audience)
        db.session.commit()
        return {"notice": notice.to_dict()}, 201


@ns.route("/notices/<int:notice_id>")
class AdminNotice(Resource):
    @roles_required(ROLE_ADMIN)
    def delete(self, notice_id):
        """Take a notice down. It stays in the list, marked as taken down."""
        notice = db.session.get(Notice, notice_id)
        if notice is None:
            abort(404, "Notice not found.")
        if notice.is_active:
            notice.is_active = False
            audit.record("notice.removed", actor=current_user, target_type="notice", target_id=notice.id)
            db.session.commit()
        return {"notice": notice.to_dict()}

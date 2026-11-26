"""The family leaderboard: who earned the most from approved tasks this week or this month.

It counts effort, not savings: balances aren't shown, so spending points never moves anyone
down. A family only has one once a parent turns it on, and the administrator can switch
leaderboards off for the whole site.
"""
from datetime import datetime, time, timedelta, timezone

from flask import request
from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, select

from ..core.security import roles_required
from ..extensions import db
from ..models import (
    FOCUS_COMPLETED, ROLE_CHILD, ROLE_PARENT, SUBMISSION_APPROVED, TX_TASK_REWARD, FocusSession, PointTransaction,
    TaskSubmission, User,
)
from ..services.routines import family_today, family_tz
from ..services.site import require_feature

ns = Namespace("leaderboard", description="The family leaderboard (when the family turned it on)")

PERIODS = ("week", "month")


def _period_start(family, period):
    """Monday (or the 1st) of this week (or month) where the family lives, as a date and a UTC time."""
    today = family_today(family)
    day = today - timedelta(days=today.weekday()) if period == "week" else today.replace(day=1)
    return day, datetime.combine(day, time.min, tzinfo=family_tz(family)).astimezone(timezone.utc)


@ns.route("")
class Leaderboard(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    @require_feature("leaderboard")
    def get(self):
        """?period=week (from Monday) or month (from the 1st). Parents can look even while it's off."""
        family = current_user.family
        if current_user.role == ROLE_CHILD and not family.leaderboard_enabled:
            abort(403, "Your family hasn't turned on the leaderboard.", error="leaderboard_off")
        period = request.args.get("period", "week")
        if period not in PERIODS:
            abort(400, "period must be week or month.")
        start_day, since = _period_start(family, period)

        kids = db.session.scalars(select(User).where(
            User.family_id == family.id, User.role == ROLE_CHILD, User.is_active.is_(True)).order_by(User.id)).all()
        kid_ids = [k.id for k in kids]
        points = dict(db.session.execute(
            select(PointTransaction.child_id, func.sum(PointTransaction.amount))
            .where(PointTransaction.child_id.in_(kid_ids), PointTransaction.kind == TX_TASK_REWARD,
                   PointTransaction.created_at >= since)
            .group_by(PointTransaction.child_id)).all())
        tasks = dict(db.session.execute(
            select(TaskSubmission.child_id, func.count(TaskSubmission.id))
            .where(TaskSubmission.child_id.in_(kid_ids), TaskSubmission.status == SUBMISSION_APPROVED,
                   TaskSubmission.reviewed_at >= since)
            .group_by(TaskSubmission.child_id)).all())
        focus = dict(db.session.execute(
            select(FocusSession.child_id, func.sum(FocusSession.minutes))
            .where(FocusSession.child_id.in_(kid_ids), FocusSession.status == FOCUS_COMPLETED,
                   FocusSession.started_at >= since)
            .group_by(FocusSession.child_id)).all())

        rows = [{
            "child": {"id": k.id, "display_name": k.display_name, "avatar": k.avatar},
            "points": int(points.get(k.id) or 0),
            "tasks": int(tasks.get(k.id) or 0),
            "focus_minutes": int(focus.get(k.id) or 0),
            "is_me": k.id == current_user.id,
        } for k in kids]
        rows.sort(key=lambda r: (-r["points"], -r["tasks"], r["child"]["display_name"].lower()))
        rank, last = 0, None
        for position, row in enumerate(rows, start=1):  # equal points and tasks share a place
            if (row["points"], row["tasks"]) != last:
                rank, last = position, (row["points"], row["tasks"])
            row["rank"] = rank
        return {
            "period": period,
            "since": start_day.isoformat(),
            "enabled": family.leaderboard_enabled,
            "team_points": sum(r["points"] for r in rows),
            "items": rows,
        }

"""A kid's report for parents: how the last 30 days went."""
from datetime import datetime, time, timedelta, timezone

from flask_restx import Namespace, Resource, abort
from sqlalchemy import case, func, select

from ..core.security import family_child_or_404, roles_required
from ..core.validation import query_int
from ..extensions import db
from ..models import (
    FOCUS_COMPLETED, ROLE_PARENT, SUBMISSION_APPROVED, SUBMISSION_REJECTED, TASK_EXPIRED, FocusSession,
    PointTransaction, Task, TaskSubmission,
)
from ..services.routines import ensure_family_day, family_today, family_tz

ns = Namespace("report", description="How a kid's last days went (parents only)")


@ns.route("")
class Report(Resource):
    @roles_required(ROLE_PARENT)
    def get(self):
        """?child_id= (required) and ?days= (7 to 90, default 30), counted in the family's time zone,
        today included."""
        child_id = query_int("child_id")
        if child_id is None:
            abort(400, "child_id is required.")
        child = family_child_or_404(child_id)
        days = query_int("days", default=30, min_value=7, max_value=90)
        family = child.family
        ensure_family_day(family.id)  # so yesterday's missed routine tasks are counted as missed
        today = family_today(family)
        first_day = today - timedelta(days=days - 1)
        since = datetime.combine(first_day, time.min, tzinfo=family_tz(family)).astimezone(timezone.utc)

        reviewed = db.session.execute(
            select(TaskSubmission.status, Task.routine_id)
            .join(Task, Task.id == TaskSubmission.task_id)
            .where(TaskSubmission.child_id == child.id,
                   TaskSubmission.status.in_((SUBMISSION_APPROVED, SUBMISSION_REJECTED)),
                   TaskSubmission.reviewed_at >= since)
        ).all()
        approved = [row for row in reviewed if row.status == SUBMISSION_APPROVED]
        routines_done = sum(1 for row in approved if row.routine_id is not None)
        routines_missed = db.session.scalar(
            select(func.count(Task.id)).where(Task.assigned_to_id == child.id, Task.status == TASK_EXPIRED,
                                              Task.occurrence_date >= first_day)) or 0
        earned, spent = db.session.execute(
            select(func.coalesce(func.sum(case((PointTransaction.amount > 0, PointTransaction.amount), else_=0)), 0),
                   func.coalesce(func.sum(case((PointTransaction.amount < 0, -PointTransaction.amount), else_=0)), 0))
            .where(PointTransaction.child_id == child.id, PointTransaction.created_at >= since)
        ).one()
        focus_minutes = db.session.scalar(
            select(func.coalesce(func.sum(FocusSession.minutes), 0))
            .where(FocusSession.child_id == child.id, FocusSession.status == FOCUS_COMPLETED,
                   FocusSession.started_at >= since)) or 0

        routine_days = routines_done + routines_missed
        return {
            "child_id": child.id,
            "from": first_day.isoformat(),
            "to": today.isoformat(),
            "days": days,
            "approved": len(approved),
            "sent_back": len(reviewed) - len(approved),
            "routines_done": routines_done,
            "routines_missed": int(routines_missed),
            # Share of routine tasks done (None when there were none to do).
            "routine_rate": round(routines_done / routine_days, 2) if routine_days else None,
            "points_earned": int(earned),
            "points_spent": int(spent),
            "focus_minutes": int(focus_minutes),
        }

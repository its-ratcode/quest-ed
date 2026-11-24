"""One request with everything a signed-in person's first page needs."""
from datetime import timedelta

from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource
from sqlalchemy import case, func, select
from sqlalchemy.orm import joinedload

from ..core.security import roles_required
from ..extensions import db
from ..models import (
    REDEMPTION_PENDING, ROLE_ADMIN, ROLE_CHILD, ROLE_PARENT, SUBMISSION_APPROVED, SUBMISSION_PENDING, TASK_APPROVED,
    TASK_ARCHIVED, TASK_OPEN, TASK_SUBMITTED, PointTransaction, Redemption, Reward, Task, TaskSubmission, User, utcnow,
)
from ..services.goals import savings_goal
from ..services.routines import ensure_for_user, family_today

ns = Namespace("dashboard", description="What each person's first page shows")


def _count(stmt):
    return db.session.scalar(stmt) or 0


def _parent_summary(user):
    family_id = user.family_id
    kids = db.session.scalars(
        select(User).where(User.family_id == family_id, User.role == ROLE_CHILD).order_by(User.id)).all()
    open_tasks = dict(db.session.execute(
        select(Task.assigned_to_id, func.count(Task.id))
        .where(Task.family_id == family_id, Task.status == TASK_OPEN).group_by(Task.assigned_to_id)).all())
    # Each kid's tasks for today and how many are approved, counted here so it stays right
    # however many kids and tasks there are.
    today = family_today(user.family)
    today_counts = {row.kid: (row.total, int(row.done or 0)) for row in db.session.execute(
        select(Task.assigned_to_id.label("kid"), func.count(Task.id).label("total"),
               func.sum(case((Task.status == TASK_APPROVED, 1), else_=0)).label("done"))
        .where(Task.family_id == family_id, Task.status != TASK_ARCHIVED,
               func.coalesce(Task.occurrence_date, Task.due_date) == today)
        .group_by(Task.assigned_to_id))}
    waiting = (select(TaskSubmission).join(Task, Task.id == TaskSubmission.task_id)
               .where(Task.family_id == family_id, TaskSubmission.status == SUBMISSION_PENDING))
    pending = db.session.scalars(
        waiting.options(joinedload(TaskSubmission.task), joinedload(TaskSubmission.child))
        .order_by(TaskSubmission.submitted_at).limit(50)).all()  # the Overview is where parents approve
    handovers = db.session.scalars(
        select(Redemption).where(Redemption.family_id == family_id, Redemption.status == REDEMPTION_PENDING)
        .options(joinedload(Redemption.child)).order_by(Redemption.created_at).limit(5)).all()
    recent = db.session.scalars(
        select(PointTransaction).where(PointTransaction.family_id == family_id)
        .options(joinedload(PointTransaction.child), joinedload(PointTransaction.created_by))
        .order_by(PointTransaction.created_at.desc(), PointTransaction.id.desc()).limit(8)).all()
    week_ago = utcnow() - timedelta(days=7)
    return {
        "role": ROLE_PARENT,
        "children": [dict(kid.to_dict(), open_tasks=open_tasks.get(kid.id, 0),
                          today_total=today_counts.get(kid.id, (0, 0))[0],
                          today_done=today_counts.get(kid.id, (0, 0))[1]) for kid in kids],
        "pending_submissions": [s.to_dict() for s in pending],
        "pending_submissions_total": _count(select(func.count()).select_from(waiting.subquery())),
        "pending_redemptions": [r.to_dict() for r in handovers],
        "recent_activity": [t.to_dict() for t in recent],
        "approved_this_week": _count(
            select(func.count(TaskSubmission.id)).join(Task, Task.id == TaskSubmission.task_id)
            .where(Task.family_id == family_id, TaskSubmission.status == SUBMISSION_APPROVED,
                   TaskSubmission.reviewed_at >= week_ago)),
    }


def _child_summary(user):
    def tasks_with(status):
        return _count(select(func.count(Task.id)).where(Task.assigned_to_id == user.id, Task.status == status))

    week_ago = utcnow() - timedelta(days=7)
    next_tasks = db.session.scalars(
        select(Task).where(Task.assigned_to_id == user.id, Task.status == TASK_OPEN)
        .order_by(Task.due_date.is_(None), Task.due_date, Task.created_at.desc()).limit(5)).all()
    recent = db.session.scalars(
        select(PointTransaction).where(PointTransaction.child_id == user.id)
        .order_by(PointTransaction.created_at.desc(), PointTransaction.id.desc()).limit(5)).all()
    cheapest = db.session.scalars(
        select(Reward).where(Reward.family_id == user.family_id, Reward.is_active.is_(True))
        .order_by(Reward.cost, Reward.id).limit(4)).all()
    goal = savings_goal(user)
    return {
        "role": ROLE_CHILD,
        "balance": user.points_balance,
        "earned_this_week": int(_count(
            select(func.coalesce(func.sum(PointTransaction.amount), 0))
            .where(PointTransaction.child_id == user.id, PointTransaction.amount > 0,
                   PointTransaction.created_at >= week_ago))),
        "task_counts": {
            "open": tasks_with(TASK_OPEN),
            "submitted": tasks_with(TASK_SUBMITTED),
            "approved_this_week": _count(
                select(func.count(TaskSubmission.id))
                .where(TaskSubmission.child_id == user.id, TaskSubmission.status == SUBMISSION_APPROVED,
                       TaskSubmission.reviewed_at >= week_ago)),
        },
        "next_tasks": [t.to_dict() for t in next_tasks],
        "recent_transactions": [t.to_dict() for t in recent],
        "reward_highlights": [dict(r.to_dict(), affordable=user.points_balance >= r.cost
                                   and (r.stock is None or r.stock > 0)) for r in cheapest],
        "pending_redemptions": _count(
            select(func.count(Redemption.id))
            .where(Redemption.child_id == user.id, Redemption.status == REDEMPTION_PENDING)),
        # The reward the kid is saving for (None if none, or it was taken out of the shop).
        "savings_goal": goal.to_dict() if goal else None,
    }


@ns.route("/summary")
class Summary(Resource):
    @roles_required(ROLE_ADMIN, ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """Everything the signed-in person's first page needs, in one request.
        (The admin's overview gets its numbers with the admin pages.)"""
        if current_user.role == ROLE_ADMIN:
            return {"role": ROLE_ADMIN}
        ensure_for_user(current_user)  # today's routine tasks
        if current_user.role == ROLE_PARENT:
            return _parent_summary(current_user)
        return _child_summary(current_user)

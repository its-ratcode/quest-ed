"""A family's data as one JSON file the parents can download and keep.

Grouped per kid, with a short "about" section that explains the data, so it reads on its own.
It holds what happened, not account secrets: no emails, usernames, passwords, invite codes or
internal ids. Times are in the family's own time zone ("2026-11-11 18:30").
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, true

from ..extensions import db
from ..models import (
    REDEMPTION_CANCELLED, ROLE_CHILD, ROUTINE_ARCHIVED, ROUTINE_PAUSED, SUBMISSION_APPROVED, SUBMISSION_PENDING,
    SUBMISSION_REJECTED, Badge, EarnedBadge, PointTransaction, Redemption, Routine, Task, TaskSubmission, User, utcnow,
)
from . import badges
from .categories import family_categories
from .routines import family_today, family_tz

WEEKDAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
SUBMISSION_WORDS = {SUBMISSION_APPROVED: "approved", SUBMISSION_REJECTED: "sent back",
                    SUBMISSION_PENDING: "waiting for a parent"}
REWARD_WORDS = {"pending": "waiting to be handed over", "fulfilled": "handed over",
                "cancelled": "cancelled (points returned)"}

ABOUT = {
    "what": "Activity exported from Quest-Ed: tasks, routines, points, rewards and badges.",
    "times": "Local time in the family's time zone.",
    "points": "Kids earn points when a parent approves a task and spend them on rewards. "
              "A balance can never go below zero.",
    "not_included": "Emails, usernames, passwords, invite codes and internal ids.",
}


class _Clock:
    """Writes stored times (UTC) as local time in the family's time zone."""

    def __init__(self, family):
        self.tz = family_tz(family)

    def __call__(self, value, with_time=True):
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is None:  # SQLite gives times back without a zone; they're stored in UTC
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(self.tz).strftime("%Y-%m-%d %H:%M" if with_time else "%Y-%m-%d")
        return value.isoformat()  # a date


def _since(family, days):
    """The start of the first day of the period (in UTC), or None for everything."""
    if not days:
        return None
    first = family_today(family) - timedelta(days=days - 1)
    tz = family_tz(family)
    return datetime(first.year, first.month, first.day, tzinfo=tz).astimezone(timezone.utc)


def _after(column, since):
    return column >= since if since is not None else true()


def build_export(family, child=None, days=None):
    """Everything worth knowing about the family's kids (or one kid), as plain data."""
    when = _Clock(family)
    since = _since(family, days)
    category = {c.key: c.label for c in family_categories(family.id)}  # hidden ones too
    badge_titles = dict(db.session.execute(select(Badge.id, Badge.title).where(Badge.family_id == family.id)).all())
    kids = [child] if child is not None else db.session.scalars(
        select(User).where(User.family_id == family.id, User.role == ROLE_CHILD).order_by(User.id)).all()

    children = []
    for kid in kids:
        stats = badges.child_stats(kid)
        history = db.session.execute(
            select(TaskSubmission, Task).join(Task, Task.id == TaskSubmission.task_id)
            .where(TaskSubmission.child_id == kid.id, _after(TaskSubmission.submitted_at, since))
            .order_by(TaskSubmission.submitted_at)).all()
        ledger = db.session.scalars(
            select(PointTransaction).where(PointTransaction.child_id == kid.id, _after(PointTransaction.created_at, since))
            .order_by(PointTransaction.created_at, PointTransaction.id)).all()
        rewards = db.session.scalars(
            select(Redemption).where(Redemption.child_id == kid.id, _after(Redemption.created_at, since))
            .order_by(Redemption.created_at)).all()
        earned = db.session.scalars(
            select(EarnedBadge).where(EarnedBadge.child_id == kid.id, _after(EarnedBadge.earned_at, since))
            .order_by(EarnedBadge.earned_at)).all()
        routines = db.session.scalars(
            select(Routine).where(Routine.assigned_to_id == kid.id, Routine.status != ROUTINE_ARCHIVED)
            .order_by(Routine.id)).all()

        children.append({
            "name": kid.display_name,
            "avatar": kid.avatar,
            "points_balance": kid.points_balance,
            "joined": when(kid.created_at, with_time=False),
            "summary": {
                "tasks_approved": sum(1 for s, _t in history if s.status == SUBMISSION_APPROVED),
                "tasks_sent_back": sum(1 for s, _t in history if s.status == SUBMISSION_REJECTED),
                "routine_tasks_approved": sum(1 for s, t in history if s.status == SUBMISSION_APPROVED and t.routine_id),
                "points_earned": sum(tx.amount for tx in ledger if tx.amount > 0),
                "points_spent": -sum(tx.amount for tx in ledger if tx.amount < 0),
                "rewards_bought": sum(1 for r in rewards if r.status != REDEMPTION_CANCELLED and r.cost > 0),
                "badges_earned": len(earned),
                "current_streak_days": stats["current_streak"],
                "best_streak_days": stats["best_streak"],
            },
            "routines": [{
                "title": r.title, "category": category.get(r.category, r.category), "points": r.points,
                "days": [WEEKDAY_NAMES[d] for d in r.weekday_list], "paused": r.status == ROUTINE_PAUSED,
            } for r in routines],
            "task_history": [{
                "task": t.title, "category": category.get(t.category, t.category), "points": t.points,
                "routine": t.routine_id is not None, "due": when(t.occurrence_date or t.due_date),
                "sent_in": when(s.submitted_at), "reviewed": when(s.reviewed_at),
                "result": SUBMISSION_WORDS.get(s.status, s.status),
                "kid_note": s.note or None, "parent_note": s.review_note or None, "had_photo": bool(s.photo),
            } for s, t in history],
            "points": [{
                "date": when(tx.created_at), "change": tx.amount, "balance_after": tx.balance_after,
                "kind": tx.kind, "reason": tx.description,
            } for tx in ledger],
            "rewards": [{
                "date": when(r.created_at), "reward": r.reward_title, "cost": r.cost,
                "free_with_badge": r.cost == 0, "status": REWARD_WORDS.get(r.status, r.status),
            } for r in rewards],
            "badges": [{
                "date": when(e.earned_at), "badge": badge_titles.get(e.badge_id, "A removed badge"),
            } for e in earned],
        })

    return {
        "about": ABOUT,
        "family": family.name,
        "time_zone": family.timezone,
        "exported_at": when(utcnow()),
        "period": "everything" if not days else "today" if days == 1 else f"last {days} days",
        "children": children,
    }

"""Removing people for good.

Each step that stores something about a kid (tasks, points, rewards, badges,
photos…) adds it here, so removing a kid always removes everything about them.
"""
from sqlalchemy import delete, or_, select, update

from ..extensions import db
from ..models import (
    AuditLog, Badge, Category, EarnedBadge, Family, FocusSession, PointTransaction, Redemption, Reward, Routine, SavingsGoal, Task,
    TaskSubmission, User,
)


def _photo_names(task_ids):
    return [name for name in db.session.scalars(
        select(TaskSubmission.photo).where(TaskSubmission.task_id.in_(task_ids))) if name]


def erase_child(child):
    """Delete a kid's account and everything that belongs to them. The caller commits,
    then deletes the returned photo files (photos.delete_files)."""
    task_ids = select(Task.id).where(Task.assigned_to_id == child.id)
    routine_ids = select(Routine.id).where(Routine.assigned_to_id == child.id)
    own_badge_ids = select(Badge.id).where(Badge.child_id == child.id)  # badges made just for this kid
    photo_names = _photo_names(task_ids)
    db.session.execute(delete(PointTransaction).where(PointTransaction.child_id == child.id))
    db.session.execute(delete(Redemption).where(Redemption.child_id == child.id))
    db.session.execute(delete(SavingsGoal).where(SavingsGoal.child_id == child.id))
    db.session.execute(delete(FocusSession).where(FocusSession.child_id == child.id))
    db.session.execute(delete(TaskSubmission).where(TaskSubmission.task_id.in_(task_ids)))
    db.session.execute(delete(Task).where(Task.assigned_to_id == child.id))
    # A routine moved to this kid from a sibling still points to the sibling's old copies; they stay.
    db.session.execute(update(Task).where(Task.routine_id.in_(routine_ids)).values(routine_id=None))
    db.session.execute(delete(Routine).where(Routine.assigned_to_id == child.id))
    # A badge made just for this kid may have been earned by a sibling before it was moved to them.
    db.session.execute(delete(EarnedBadge).where(
        or_(EarnedBadge.child_id == child.id, EarnedBadge.badge_id.in_(own_badge_ids))))
    db.session.execute(delete(Badge).where(Badge.child_id == child.id))
    db.session.execute(delete(AuditLog).where(AuditLog.actor_id == child.id))  # what the kid did
    db.session.delete(child)
    return photo_names


def erase_family(family_id):
    """Delete a family, everyone in it, and everything they made. The caller commits, then deletes
    the returned photo files. Order matters: rows go before the rows they point to."""
    user_ids = select(User.id).where(User.family_id == family_id)
    task_ids = select(Task.id).where(Task.family_id == family_id)
    photo_names = _photo_names(task_ids)
    for model in (EarnedBadge, SavingsGoal, FocusSession, PointTransaction, Redemption, Badge):
        db.session.execute(delete(model).where(model.family_id == family_id))
    db.session.execute(delete(TaskSubmission).where(TaskSubmission.task_id.in_(task_ids)))
    for model in (Task, Routine, Reward, Category):
        db.session.execute(delete(model).where(model.family_id == family_id))
    db.session.execute(delete(AuditLog).where(or_(AuditLog.family_id == family_id, AuditLog.actor_id.in_(user_ids))))
    db.session.execute(delete(User).where(User.family_id == family_id))
    db.session.execute(delete(Family).where(Family.id == family_id))
    return photo_names

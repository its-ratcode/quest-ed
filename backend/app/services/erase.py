"""Removing people for good.

Each step that stores something about a kid (tasks, points, rewards, badges,
photos…) adds it here, so removing a kid always removes everything about them.
"""
from sqlalchemy import delete, select, update

from ..extensions import db
from ..models import PointTransaction, Redemption, Routine, Task, TaskSubmission


def erase_child(child):
    """Delete a kid's account and everything that belongs to them. The caller commits,
    then deletes the returned photo files (photos.delete_files)."""
    task_ids = select(Task.id).where(Task.assigned_to_id == child.id)
    routine_ids = select(Routine.id).where(Routine.assigned_to_id == child.id)
    photo_names = [name for name in db.session.scalars(
        select(TaskSubmission.photo).where(TaskSubmission.task_id.in_(task_ids))) if name]
    db.session.execute(delete(PointTransaction).where(PointTransaction.child_id == child.id))
    db.session.execute(delete(Redemption).where(Redemption.child_id == child.id))
    db.session.execute(delete(TaskSubmission).where(TaskSubmission.task_id.in_(task_ids)))
    db.session.execute(delete(Task).where(Task.assigned_to_id == child.id))
    # A routine moved to this kid from a sibling still points to the sibling's old copies; they stay.
    db.session.execute(update(Task).where(Task.routine_id.in_(routine_ids)).values(routine_id=None))
    db.session.execute(delete(Routine).where(Routine.assigned_to_id == child.id))
    db.session.delete(child)
    return photo_names

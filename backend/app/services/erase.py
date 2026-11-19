"""Removing people for good.

Each step that stores something about a kid (tasks, points, rewards, badges,
photos…) adds it here, so removing a kid always removes everything about them.
"""
from sqlalchemy import delete, select

from ..extensions import db
from ..models import PointTransaction, Task, TaskSubmission


def erase_child(child):
    """Delete a kid's account and everything that belongs to them. The caller commits."""
    task_ids = select(Task.id).where(Task.assigned_to_id == child.id)
    db.session.execute(delete(PointTransaction).where(PointTransaction.child_id == child.id))
    db.session.execute(delete(TaskSubmission).where(TaskSubmission.task_id.in_(task_ids)))
    db.session.execute(delete(Task).where(Task.assigned_to_id == child.id))
    db.session.delete(child)

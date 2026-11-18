"""Removing people for good.

Each step that stores something about a kid (tasks, points, rewards, badges,
photos…) adds it here, so removing a kid always removes everything about them.
"""
from sqlalchemy import delete

from ..extensions import db
from ..models import Task


def erase_child(child):
    """Delete a kid's account and everything that belongs to them. The caller commits."""
    db.session.execute(delete(Task).where(Task.assigned_to_id == child.id))
    db.session.delete(child)

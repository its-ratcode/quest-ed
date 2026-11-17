"""Removing people for good.

Each later step that stores something about a kid (tasks, points, rewards, badges,
photos…) adds it here, so removing a kid always removes everything about them.
"""
from ..extensions import db


def erase_child(child):
    """Delete a kid's account and everything that belongs to them. The caller commits."""
    db.session.delete(child)

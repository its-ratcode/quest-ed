"""The points ledger: the only place a kid's balance changes.

Each change updates the balance with one conditional UPDATE (so two spends at the same
moment can't take it below zero) and writes a history entry with the new balance.
Callers commit or roll back.
"""
from sqlalchemy import select, update

from ..extensions import db
from ..models import PointTransaction, User


class InsufficientPoints(Exception):
    """The kid doesn't have enough points for this."""


def _apply(child, amount, kind, description, created_by=None, submission_id=None, redemption_id=None):
    stmt = update(User).where(User.id == child.id).values(points_balance=User.points_balance + amount)
    if amount < 0:
        stmt = stmt.where(User.points_balance >= -amount)
    result = db.session.execute(stmt, execution_options={"synchronize_session": False})
    if result.rowcount != 1:
        raise InsufficientPoints()

    balance = db.session.scalar(select(User.points_balance).where(User.id == child.id))
    db.session.refresh(child, attribute_names=["points_balance"])
    entry = PointTransaction(
        family_id=child.family_id, child_id=child.id, amount=amount, balance_after=balance, kind=kind,
        description=description[:200], submission_id=submission_id, redemption_id=redemption_id,
        created_by_id=created_by.id if created_by is not None else None,
    )
    db.session.add(entry)
    return entry


def credit(child, amount, kind, description, **kwargs):
    """Give points (amount > 0)."""
    if amount <= 0:
        raise ValueError("credit amount must be positive")
    return _apply(child, amount, kind, description, **kwargs)


def debit(child, amount, kind, description, **kwargs):
    """Take points away (amount > 0). Raises InsufficientPoints if the kid doesn't have enough."""
    if amount <= 0:
        raise ValueError("debit amount must be positive")
    return _apply(child, -amount, kind, description, **kwargs)

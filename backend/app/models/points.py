from ..extensions import db
from .base import iso, utcnow
from .user import user_brief

TX_TASK_REWARD = "task_reward"  # a task was approved
TX_ADJUSTMENT = "adjustment"    # a parent added or took away points by hand


class PointTransaction(db.Model):
    """One change to a kid's points: the points history. A kid's balance is always the sum
    of these; `balance_after` keeps the running total at each step."""

    __tablename__ = "point_transactions"

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    child_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    amount = db.Column(db.Integer, nullable=False)  # + earned, − spent
    balance_after = db.Column(db.Integer, nullable=False)
    kind = db.Column(db.String(20), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    submission_id = db.Column(db.Integer, db.ForeignKey("task_submissions.id"), nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)

    child = db.relationship("User", foreign_keys=[child_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "child": user_brief(self.child),
            "amount": self.amount,
            "balance_after": self.balance_after,
            "kind": self.kind,
            "description": self.description,
            "submission_id": self.submission_id,
            "created_by": user_brief(self.created_by),
            "created_at": iso(self.created_at),
        }

from ..extensions import db
from .base import iso, utcnow
from .user import user_brief

REDEMPTION_PENDING = "pending"      # points spent; waiting for a parent to hand it over
REDEMPTION_FULFILLED = "fulfilled"  # handed over
REDEMPTION_CANCELLED = "cancelled"  # called off; the points went back
REDEMPTION_STATUSES = (REDEMPTION_PENDING, REDEMPTION_FULFILLED, REDEMPTION_CANCELLED)


class Reward(db.Model):
    """Something in the family's reward shop that kids buy with points."""

    __tablename__ = "rewards"
    __table_args__ = (db.CheckConstraint("stock IS NULL OR stock >= 0", name="stock_not_negative"),)

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    emoji = db.Column(db.String(16), nullable=False, default="🎁")
    cost = db.Column(db.Integer, nullable=False)
    stock = db.Column(db.Integer, nullable=True)  # how many are left; empty = no limit
    is_active = db.Column(db.Boolean, nullable=False, default=True)  # false = taken out of the shop
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "emoji": self.emoji,
            "cost": self.cost,
            "stock": self.stock,
            "is_active": self.is_active,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }


class SavingsGoal(db.Model):
    """The reward a kid is saving up for (one at a time). Kept in its own table so the users
    table, which almost everything points to, doesn't need rebuilding for it."""

    __tablename__ = "savings_goals"

    child_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    reward_id = db.Column(db.Integer, db.ForeignKey("rewards.id"), nullable=False)
    set_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    reward = db.relationship("Reward")


class Redemption(db.Model):
    """A kid buying a reward. The points are taken right away; a parent then hands it over,
    or it's cancelled and the points go back. The reward's name and price are kept as they
    were, so the history stays true when the reward changes later."""

    __tablename__ = "redemptions"

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    reward_id = db.Column(db.Integer, db.ForeignKey("rewards.id"), nullable=False)
    child_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    reward_title = db.Column(db.String(120), nullable=False)
    reward_emoji = db.Column(db.String(16), nullable=False, default="🎁")
    cost = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False, default=REDEMPTION_PENDING, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    resolved_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    child = db.relationship("User", foreign_keys=[child_id])
    resolved_by = db.relationship("User", foreign_keys=[resolved_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "reward_id": self.reward_id,
            "reward_title": self.reward_title,
            "reward_emoji": self.reward_emoji,
            "cost": self.cost,
            "status": self.status,
            "child": user_brief(self.child),
            "resolved_by": user_brief(self.resolved_by),
            "created_at": iso(self.created_at),
            "resolved_at": iso(self.resolved_at),
        }

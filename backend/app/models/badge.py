from ..extensions import db
from .base import iso, utcnow
from .user import user_brief

# How a badge is earned. Each one except "manual" counts something until it reaches `target`;
# "manual" badges are given by a parent.
BADGE_RULES = ("tasks", "category_tasks", "streak", "points", "points_saved", "routines", "rewards",
               "focus_sessions", "focus_minutes", "manual")


class Badge(db.Model):
    """A family's badge. New families get a copy of the starter set (services.badges.STARTER_BADGES),
    which parents can change or remove like any badge they make themselves."""

    __tablename__ = "badges"

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    title = db.Column(db.String(60), nullable=False)
    description = db.Column(db.String(200), nullable=False, default="")
    icon = db.Column(db.String(20), nullable=False, default="star")  # one of looks.PICTURES
    tone = db.Column(db.String(10), nullable=False, default="mint")  # one of looks.TONES
    rule = db.Column(db.String(20), nullable=False)
    category = db.Column(db.String(30), nullable=True)  # a Category key, for rule "category_tasks"
    target = db.Column(db.Integer, nullable=True)  # the number to reach; empty for "manual"
    child_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)  # empty: for every kid
    # An optional prize for earning it: extra points, and/or a reward from the shop for free
    # (it then waits for a parent to hand it over, like a bought one).
    bonus_points = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    bonus_reward_id = db.Column(db.Integer, db.ForeignKey("rewards.id"), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)  # False once removed; earned copies stay
    starter_key = db.Column(db.String(30), nullable=True)  # which starter badge this was copied from
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    child = db.relationship("User", foreign_keys=[child_id])
    bonus_reward = db.relationship("Reward", foreign_keys=[bonus_reward_id])

    def to_dict(self):
        reward = self.bonus_reward
        return {
            "id": self.id, "title": self.title, "description": self.description, "icon": self.icon,
            "tone": self.tone, "rule": self.rule, "category": self.category, "target": self.target,
            "child": user_brief(self.child), "is_active": self.is_active, "starter": self.starter_key is not None,
            "bonus_points": self.bonus_points or 0,
            "bonus_reward": {"id": reward.id, "title": reward.title, "emoji": reward.emoji} if reward else None,
            "created_at": iso(self.created_at),
        }


class EarnedBadge(db.Model):
    """A kid earned a badge (once each)."""

    __tablename__ = "earned_badges"
    __table_args__ = (db.UniqueConstraint("child_id", "badge_id"),)

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    child_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    badge_id = db.Column(db.Integer, db.ForeignKey("badges.id"), nullable=False, index=True)
    earned_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

import json

from ..extensions import db
from .base import iso, utcnow
from .user import user_brief


class AuditLog(db.Model):
    """Who did what, and when: sign-ins, approvals, points changes, removals… Written in the same
    transaction as the change it records, so one never exists without the other. Details hold
    numbers and ids, not names, so removing someone leaves nothing personal behind."""

    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)  # empty: no one signed in
    action = db.Column(db.String(60), nullable=False, index=True)  # e.g. "task.approved"
    target_type = db.Column(db.String(40), nullable=True)  # e.g. "task", "user", "family"
    target_id = db.Column(db.Integer, nullable=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=True, index=True)
    details = db.Column(db.Text, nullable=False, default="{}")  # JSON
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def to_dict(self):
        return {
            "id": self.id,
            "action": self.action,
            "actor": dict(user_brief(self.actor), role=self.actor.role) if self.actor else None,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "family_id": self.family_id,
            "details": json.loads(self.details or "{}"),
            "created_at": iso(self.created_at),
        }

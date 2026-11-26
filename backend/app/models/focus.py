from datetime import timedelta, timezone

from sqlalchemy import text

from ..extensions import db
from .base import iso, utcnow

FOCUS_ACTIVE = "active"
FOCUS_COMPLETED = "completed"
FOCUS_CANCELLED = "cancelled"
FOCUS_STATUSES = (FOCUS_ACTIVE, FOCUS_COMPLETED, FOCUS_CANCELLED)


class FocusSession(db.Model):
    """A kid's timed stretch of concentration. Whether the time is really up is checked
    against the server's clock, never the device's."""

    __tablename__ = "focus_sessions"
    # A kid has at most one session running, even if two "Start" clicks arrive at once.
    __table_args__ = (
        db.Index("one_running_focus_per_kid", "child_id", unique=True,
                 sqlite_where=text("status = 'active'"), postgresql_where=text("status = 'active'")),
    )

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    child_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    label = db.Column(db.String(80), nullable=False, default="")  # what they're working on, optional
    minutes = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False, default=FOCUS_ACTIVE, index=True)
    started_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    ended_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def ends_at(self):
        start = self.started_at if self.started_at.tzinfo else self.started_at.replace(tzinfo=timezone.utc)
        return start + timedelta(minutes=self.minutes)

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "minutes": self.minutes,
            "status": self.status,
            "started_at": iso(self.started_at),
            "ends_at": iso(self.ends_at()),
            "ended_at": iso(self.ended_at),
        }

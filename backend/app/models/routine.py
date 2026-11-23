from ..extensions import db
from .base import iso, utcnow
from .user import user_brief

ROUTINE_ACTIVE = "active"      # makes a task on each of its days
ROUTINE_PAUSED = "paused"      # kept, but makes no tasks until resumed
ROUTINE_ARCHIVED = "archived"  # deleted by a parent; the tasks it made (and their points) are kept
ROUTINE_STATUSES = (ROUTINE_ACTIVE, ROUTINE_PAUSED, ROUTINE_ARCHIVED)
ALL_WEEKDAYS = "0123456"  # Monday = 0 … Sunday = 6, like date.weekday()


class Routine(db.Model):
    """A task that repeats: on each of its weekdays, the kid gets that day's copy of it as a Task."""

    __tablename__ = "routines"

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    category = db.Column(db.String(30), nullable=False, default="chores")  # a Category key
    points = db.Column(db.Integer, nullable=False)
    assigned_to_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    weekdays = db.Column(db.String(7), nullable=False, default=ALL_WEEKDAYS)  # e.g. "024" = Mon, Wed, Fri
    status = db.Column(db.String(20), nullable=False, default=ROUTINE_ACTIVE, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    assigned_to = db.relationship("User", foreign_keys=[assigned_to_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])

    @property
    def weekday_list(self):
        return [int(d) for d in self.weekdays]

    def runs_on(self, day):
        return str(day.weekday()) in self.weekdays

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "points": self.points,
            "weekdays": self.weekday_list,
            "status": self.status,
            "assigned_to": user_brief(self.assigned_to),
            "created_by": user_brief(self.created_by),
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }

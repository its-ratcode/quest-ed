from ..extensions import db
from .base import iso, utcnow
from .user import user_brief

TASK_OPEN = "open"            # waiting for the kid
TASK_SUBMITTED = "submitted"  # the kid said "I did it"; waiting for a parent
TASK_APPROVED = "approved"    # done, points given
TASK_ARCHIVED = "archived"    # put away by a parent; history is kept
TASK_STATUSES = (TASK_OPEN, TASK_SUBMITTED, TASK_APPROVED, TASK_ARCHIVED)


class Task(db.Model):
    """Something a parent asked one kid to do, for points. Asking several kids makes one task each."""

    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    category = db.Column(db.String(30), nullable=False, default="chores")  # a Category key
    points = db.Column(db.Integer, nullable=False)
    assigned_to_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    due_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(20), nullable=False, default=TASK_OPEN, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    assigned_to = db.relationship("User", foreign_keys=[assigned_to_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "points": self.points,
            "status": self.status,
            "due_date": iso(self.due_date),
            "assigned_to": user_brief(self.assigned_to),
            "created_by": user_brief(self.created_by),
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }

from ..extensions import db
from .base import iso, utcnow
from .user import user_brief

TASK_OPEN = "open"            # waiting for the kid
TASK_SUBMITTED = "submitted"  # the kid said "I did it"; waiting for a parent
TASK_APPROVED = "approved"    # done, points given
TASK_ARCHIVED = "archived"    # put away by a parent; history is kept
TASK_EXPIRED = "expired"      # a routine's copy for a day that ended before it was done (no penalty)
TASK_STATUSES = (TASK_OPEN, TASK_SUBMITTED, TASK_APPROVED, TASK_ARCHIVED, TASK_EXPIRED)


class Task(db.Model):
    """Something a parent asked one kid to do, for points. Asking several kids makes one task each.
    A routine makes one task on each of its days (routine_id and occurrence_date are set then)."""

    __tablename__ = "tasks"
    # At most one copy of a routine per day, even when two requests make it at the same moment.
    __table_args__ = (db.UniqueConstraint("routine_id", "occurrence_date", name="one_per_routine_day"),)

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
    routine_id = db.Column(db.Integer, db.ForeignKey("routines.id"), nullable=True, index=True)
    occurrence_date = db.Column(db.Date, nullable=True)  # the routine's day this copy is for
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    assigned_to = db.relationship("User", foreign_keys=[assigned_to_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    routine = db.relationship("Routine")
    submissions = db.relationship("TaskSubmission", back_populates="task", order_by="TaskSubmission.id.desc()",
                                  cascade="all, delete-orphan")

    def to_dict(self):
        latest = self.submissions[0] if self.submissions else None
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "points": self.points,
            "status": self.status,
            "due_date": iso(self.due_date),
            "occurrence_date": iso(self.occurrence_date),
            # Set for a routine's copy, so the app can say "Every day" or "Mon, Wed".
            "routine": {"id": self.routine.id, "weekdays": self.routine.weekday_list} if self.routine else None,
            "assigned_to": user_brief(self.assigned_to),
            "created_by": user_brief(self.created_by),
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
            # The last "I did it" and the parent's answer (e.g. why it was sent back).
            "latest_submission": latest.to_dict(include_task=False) if latest else None,
        }

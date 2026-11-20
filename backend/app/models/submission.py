from ..extensions import db
from .base import iso, utcnow
from .user import user_brief

SUBMISSION_PENDING = "pending"    # waiting for a parent
SUBMISSION_APPROVED = "approved"  # points given
SUBMISSION_REJECTED = "rejected"  # sent back to try again
SUBMISSION_STATUSES = (SUBMISSION_PENDING, SUBMISSION_APPROVED, SUBMISSION_REJECTED)


class TaskSubmission(db.Model):
    """A kid saying "I did it" for a task, and the parent's answer. A task sent back and
    done again has several, newest first."""

    __tablename__ = "task_submissions"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("tasks.id"), nullable=False, index=True)
    child_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    note = db.Column(db.Text, nullable=False, default="")
    # Optional photo the kid added as proof: a file name in the uploads folder (services/photos.py).
    photo = db.Column(db.String(64), nullable=True)
    status = db.Column(db.String(20), nullable=False, default=SUBMISSION_PENDING, index=True)
    points_awarded = db.Column(db.Integer, nullable=True)
    review_note = db.Column(db.Text, nullable=False, default="")
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    submitted_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    reviewed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    task = db.relationship("Task", back_populates="submissions")
    child = db.relationship("User", foreign_keys=[child_id])
    reviewed_by = db.relationship("User", foreign_keys=[reviewed_by_id])

    def to_dict(self, include_task=True):
        data = {
            "id": self.id,
            "task_id": self.task_id,
            "child": user_brief(self.child),
            "note": self.note,
            "has_photo": bool(self.photo),
            "status": self.status,
            "points_awarded": self.points_awarded,
            "review_note": self.review_note,
            "reviewed_by": user_brief(self.reviewed_by),
            "submitted_at": iso(self.submitted_at),
            "reviewed_at": iso(self.reviewed_at),
        }
        if include_task:
            data["task"] = {
                "id": self.task.id,
                "title": self.task.title,
                "category": self.task.category,
                "points": self.task.points,
                "due_date": iso(self.task.due_date),
            }
        return data

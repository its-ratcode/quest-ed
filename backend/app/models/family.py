import secrets

from ..extensions import db
from .base import iso, utcnow

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I to mix up


def generate_invite_code():
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(8))


class Family(db.Model):
    """A household: its parents and kids share tasks, points and rewards."""

    __tablename__ = "families"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    # Another parent joins the family with this code.
    invite_code = db.Column(db.String(16), unique=True, nullable=False, default=generate_invite_code)
    # IANA name, e.g. "Europe/Berlin". Decides when a family's day starts.
    timezone = db.Column(db.String(64), nullable=False, default="UTC", server_default="UTC")
    # The family's last day (in its time zone) that routines made their tasks for, so it's done once a day.
    routines_checked_on = db.Column(db.Date, nullable=True)
    # The kids' leaderboard. Off until a parent turns it on: some families prefer not to compare.
    leaderboard_enabled = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    members = db.relationship("User", back_populates="family", order_by="User.id")

    def to_dict(self, include_invite=False):
        data = {"id": self.id, "name": self.name, "timezone": self.timezone,
                "leaderboard_enabled": self.leaderboard_enabled, "created_at": iso(self.created_at)}
        if include_invite:
            data["invite_code"] = self.invite_code
        return data

from ..extensions import db
from .base import iso, utcnow

NOTICE_AUDIENCES = ("all", "parents", "children")
NOTICE_LEVELS = ("info", "warning")


class SiteSetting(db.Model):
    """A site-wide setting chosen by the administrator, stored as JSON text under a name."""

    __tablename__ = "site_settings"

    key = db.Column(db.String(60), primary_key=True)
    value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class Notice(db.Model):
    """A message from the administrator, shown as a banner to everyone, parents or kids."""

    __tablename__ = "notices"

    id = db.Column(db.Integer, primary_key=True)
    message = db.Column(db.String(300), nullable=False)
    level = db.Column(db.String(10), nullable=False, default="info")
    audience = db.Column(db.String(10), nullable=False, default="all")
    is_active = db.Column(db.Boolean, nullable=False, default=True)  # false once taken down
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)  # empty: until taken down
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "message": self.message,
            "level": self.level,
            "audience": self.audience,
            "is_active": self.is_active,
            "expires_at": iso(self.expires_at),
            "created_at": iso(self.created_at),
        }

from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from .base import iso, utcnow

ROLE_ADMIN = "admin"
ROLE_PARENT = "parent"
ROLE_CHILD = "child"
ROLES = (ROLE_ADMIN, ROLE_PARENT, ROLE_CHILD)


def user_brief(user):
    """The short form of a person, shown next to things they did or own."""
    if user is None:
        return None
    return {"id": user.id, "display_name": user.display_name, "avatar": user.avatar}


class User(db.Model):
    """Anyone who signs in. Parents and admins use an email; kids use a username."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(10), nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=True)
    username = db.Column(db.String(30), unique=True, nullable=True)
    display_name = db.Column(db.String(60), nullable=False)
    avatar = db.Column(db.String(16), nullable=False, default="🙂")
    password_hash = db.Column(db.String(255), nullable=False)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=True, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    family = db.relationship("Family", back_populates="members")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self, private=False):
        """Public fields; `private` adds the email (only for the user themself)."""
        data = {
            "id": self.id,
            "role": self.role,
            "display_name": self.display_name,
            "avatar": self.avatar,
            "username": self.username,
            "family_id": self.family_id,
            "is_active": self.is_active,
            "created_at": iso(self.created_at),
        }
        if private:
            data["email"] = self.email
        return data

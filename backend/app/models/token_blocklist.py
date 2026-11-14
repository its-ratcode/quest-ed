from ..extensions import db
from .base import utcnow


class TokenBlocklist(db.Model):
    """Sessions ended by signing out. A token listed here is refused even before it expires."""

    __tablename__ = "token_blocklist"

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(64), unique=True, nullable=False, index=True)  # the token's unique id
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

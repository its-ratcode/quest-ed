from ..extensions import db
from .base import utcnow


class Category(db.Model):
    """A family's task category ("Chores", "Music practice"…).

    New families get a starter set (services/categories.py) that parents can rename,
    restyle, hide or add to. Tasks store the category's `key`, which never changes, so
    renaming a category updates everything that uses it.
    """

    __tablename__ = "categories"
    __table_args__ = (db.UniqueConstraint("family_id", "key", name="uq_categories_family_key"),)

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey("families.id"), nullable=False, index=True)
    key = db.Column(db.String(30), nullable=False)
    label = db.Column(db.String(30), nullable=False)
    icon = db.Column(db.String(20), nullable=False, default="star")
    tone = db.Column(db.String(10), nullable=False, default="mint")
    position = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    def to_dict(self):
        return {"id": self.id, "key": self.key, "label": self.label, "icon": self.icon, "tone": self.tone,
                "position": self.position, "is_active": self.is_active}

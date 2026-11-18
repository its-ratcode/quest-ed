"""Task categories belong to each family (see models.Category)."""
import secrets

from sqlalchemy import func, select

from ..extensions import db
from ..models import Category

# key, label, picture, colour: what a new family starts with. Parents can change all of it.
STARTER_CATEGORIES = (
    ("chores", "Chores", "broom", "mint"),
    ("learning", "Learning", "pencil", "lilac"),
    ("health", "Health", "heart", "sky"),
    ("kindness", "Kindness", "heart", "butter"),
    ("creativity", "Creativity", "palette", "lilac"),
    ("other", "Other", "star", "butter"),
)
MAX_CATEGORIES = 40


def add_starter_categories(family_id):
    """Give a family the starter categories it doesn't have yet (by key). The caller commits."""
    have = set(db.session.scalars(select(Category.key).where(Category.family_id == family_id)))
    for position, (key, label, icon, tone) in enumerate(STARTER_CATEGORIES):
        if key not in have:
            db.session.add(Category(family_id=family_id, key=key, label=label, icon=icon, tone=tone,
                                    position=position))


def ensure_categories(family_id):
    """A family with no categories at all (made before categories existed) gets the starters.
    Families that removed some keep their choice: only a family with none is filled."""
    if not db.session.scalar(select(Category.id).where(Category.family_id == family_id).limit(1)):
        add_starter_categories(family_id)
        db.session.commit()


def family_categories(family_id, active_only=False):
    """The family's categories in their order; hidden ones too unless `active_only`."""
    stmt = select(Category).where(Category.family_id == family_id)
    if active_only:
        stmt = stmt.where(Category.is_active.is_(True))
    return db.session.scalars(stmt.order_by(Category.position, Category.id)).all()


def usage(family_id):
    """key -> how many things use that category. Tasks, routines and badges add their
    counts here in the steps that build them; until then nothing uses a category."""
    return {}


def new_key():
    """A category's fixed key. Starters use readable keys ("chores"); added ones get a random one."""
    return "c" + secrets.token_hex(5)


def next_position(family_id):
    """Added categories go at the end."""
    last = db.session.scalar(select(func.max(Category.position)).where(Category.family_id == family_id))
    return (last or 0) + 1

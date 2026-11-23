"""Task categories belong to each family (see models.Category)."""
import secrets

from sqlalchemy import func, select

from ..extensions import db
from ..models import ROUTINE_ARCHIVED, Badge, Category, Routine, Task

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


def active_keys(family_id):
    return tuple(c.key for c in family_categories(family_id, active_only=True))


def pick(p, family_id, current=None, required=True):
    """Read "category" from a Payload: one of the family's categories in use, or the one the
    item already has (so editing a task in a hidden category still works). Without a value,
    it's the family's first category."""
    ensure_categories(family_id)
    keys = active_keys(family_id)
    allowed = keys + ((current,) if current and current not in keys else ())
    default = keys[0] if keys else "other"
    value = p.string("category", required=required, max_len=30, default=default)
    if value is not None and value not in allowed:
        p.add_error("category", "Pick one of your categories.")
        return default
    return value


def usage(family_id):
    """key -> how many tasks, routines and badges (not deleted ones) use that category."""
    counts = {}
    for stmt in (
        select(Task.category, func.count(Task.id)).where(Task.family_id == family_id).group_by(Task.category),
        select(Routine.category, func.count(Routine.id))
        .where(Routine.family_id == family_id, Routine.status != ROUTINE_ARCHIVED).group_by(Routine.category),
        select(Badge.category, func.count(Badge.id))
        .where(Badge.family_id == family_id, Badge.is_active.is_(True)).group_by(Badge.category),
    ):
        for key, count in db.session.execute(stmt):
            if key:
                counts[key] = counts.get(key, 0) + count
    return counts


def new_key():
    """A category's fixed key. Starters use readable keys ("chores"); added ones get a random one."""
    return "c" + secrets.token_hex(5)


def next_position(family_id):
    """Added categories go at the end."""
    last = db.session.scalar(select(func.max(Category.position)).where(Category.family_id == family_id))
    return (last or 0) + 1

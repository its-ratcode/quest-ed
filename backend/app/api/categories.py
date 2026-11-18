from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, select

from ..core.security import roles_required
from ..core.validation import Payload
from ..extensions import db
from ..models import PICTURES, ROLE_CHILD, ROLE_PARENT, TONES, Category
from ..services.categories import (
    MAX_CATEGORIES, ensure_categories, family_categories, new_key, next_position, usage,
)

ns = Namespace("categories", description="The family's task categories (parents can change all of them)")


def _own_category_or_404(category_id):
    category = db.session.get(Category, category_id)
    if category is None or category.family_id != current_user.family_id:
        abort(404, "Category not found.")
    return category


def _check_label(p, label, exclude_id=None):
    """Two categories in use can't have the same name (in any letter case)."""
    if not label:
        return
    stmt = select(Category.id).where(Category.family_id == current_user.family_id, Category.is_active.is_(True),
                                     func.lower(Category.label) == label.lower())
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if db.session.scalar(stmt):
        p.add_error("label", "You already have a category with this name.")


def _other_active_count(category):
    return db.session.scalar(select(func.count(Category.id)).where(
        Category.family_id == category.family_id, Category.is_active.is_(True), Category.id != category.id))


@ns.route("")
class CategoryList(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """All of the family's categories in order, hidden ones included (old tasks still use them).
        Parents also see how often each one is used."""
        ensure_categories(current_user.family_id)
        items = [c.to_dict() for c in family_categories(current_user.family_id)]
        if current_user.role == ROLE_PARENT:
            used = usage(current_user.family_id)
            for item in items:
                item["used"] = used.get(item["key"], 0)
        return {"items": items}

    @roles_required(ROLE_PARENT)
    def post(self):
        """Add a category."""
        p = Payload()
        label = p.string("label", max_len=30)
        icon = p.choice("icon", PICTURES, required=False, default="star")
        tone = p.choice("tone", TONES, required=False, default="mint")
        _check_label(p, label)
        p.validate()
        count = db.session.scalar(select(func.count(Category.id)).where(Category.family_id == current_user.family_id))
        if count >= MAX_CATEGORIES:
            abort(409, f"A family can have up to {MAX_CATEGORIES} categories. Hide or remove one first.")
        category = Category(family_id=current_user.family_id, key=new_key(), label=label, icon=icon, tone=tone,
                            position=next_position(current_user.family_id))
        db.session.add(category)
        db.session.commit()
        return {"category": dict(category.to_dict(), used=0)}, 201


@ns.route("/order")
class CategoryOrder(Resource):
    @roles_required(ROLE_PARENT)
    def put(self):
        """Set the order: {"ids": [3, 1, 2, …]}, every one of the family's categories once."""
        ids = Payload().data.get("ids")
        mine = {c.id: c for c in family_categories(current_user.family_id)}
        valid = (isinstance(ids, list) and all(isinstance(i, int) and not isinstance(i, bool) for i in ids)
                 and sorted(ids) == sorted(mine))
        if not valid:
            abort(400, "Send every category id once, in the new order.")
        for position, category_id in enumerate(ids):
            mine[category_id].position = position
        db.session.commit()
        return {"items": [c.to_dict() for c in family_categories(current_user.family_id)]}


@ns.route("/<int:category_id>")
class CategoryResource(Resource):
    @roles_required(ROLE_PARENT)
    def patch(self, category_id):
        """Rename, restyle, hide (is_active=false) or show a category."""
        category = _own_category_or_404(category_id)
        p = Payload()
        changes = {}
        if p.has("label"):
            changes["label"] = p.string("label", max_len=30)
            _check_label(p, changes["label"], exclude_id=category.id)
        if p.has("icon"):
            changes["icon"] = p.choice("icon", PICTURES)
        if p.has("tone"):
            changes["tone"] = p.choice("tone", TONES)
        if p.has("is_active"):
            changes["is_active"] = p.boolean("is_active", required=True)
        p.validate()

        if changes.get("is_active") is False and category.is_active and not _other_active_count(category):
            abort(409, "Keep at least one category for new tasks.")
        for field, value in changes.items():
            setattr(category, field, value)
        db.session.commit()
        return {"category": dict(category.to_dict(), used=usage(current_user.family_id).get(category.key, 0))}

    @roles_required(ROLE_PARENT)
    def delete(self, category_id):
        """Remove a category nothing uses. One that something uses is hidden instead,
        so the history keeps its name."""
        category = _own_category_or_404(category_id)
        if category.is_active and not _other_active_count(category):
            abort(409, "Keep at least one category for new tasks.")
        used = usage(current_user.family_id).get(category.key, 0)
        if used:
            category.is_active = False
            db.session.commit()
            return {"removed": False, "hidden": True, "category": dict(category.to_dict(), used=used)}
        db.session.delete(category)
        db.session.commit()
        return {"removed": True, "hidden": False}

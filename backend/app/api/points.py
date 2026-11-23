from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import case, func, select
from sqlalchemy.orm import joinedload

from ..core.security import family_child_or_404, roles_required
from ..core.validation import Payload, query_int
from ..extensions import db
from ..models import ROLE_CHILD, ROLE_PARENT, TX_ADJUSTMENT, PointTransaction
from ..services import badges
from ..services import points as ledger

ns = Namespace("points", description="Kids' points: balances, history, and changes by hand")

MAX_ADJUSTMENT = 10000


def _which_child(required):
    """Kids always see themselves. Parents choose a kid of their family with ?child_id=."""
    if current_user.role == ROLE_CHILD:
        return current_user
    child_id = query_int("child_id")
    if child_id is None:
        if required:
            abort(400, "child_id is required.")
        return None
    return family_child_or_404(child_id)


@ns.route("/summary")
class Summary(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """One kid's points to spend, plus everything earned and spent so far."""
        child = _which_child(required=True)
        earned, spent = db.session.execute(
            select(
                func.coalesce(func.sum(case((PointTransaction.amount > 0, PointTransaction.amount), else_=0)), 0),
                func.coalesce(func.sum(case((PointTransaction.amount < 0, -PointTransaction.amount), else_=0)), 0),
            ).where(PointTransaction.child_id == child.id)
        ).one()
        return {"child": child.to_dict(), "balance": child.points_balance,
                "earned_total": int(earned), "spent_total": int(spent)}


@ns.route("/transactions")
class Transactions(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """Points history, newest first, one page at a time (?page=, ?per_page=). Kids see
        their own; parents see one kid (?child_id=) or the whole family."""
        child = _which_child(required=False)
        page = query_int("page", default=1, min_value=1)
        per_page = query_int("per_page", default=20, min_value=5, max_value=100)

        conditions = [PointTransaction.family_id == current_user.family_id]
        if child is not None:
            conditions.append(PointTransaction.child_id == child.id)
        total = db.session.scalar(select(func.count(PointTransaction.id)).where(*conditions))
        items = db.session.scalars(
            select(PointTransaction).where(*conditions)
            .options(joinedload(PointTransaction.child), joinedload(PointTransaction.created_by))
            .order_by(PointTransaction.created_at.desc(), PointTransaction.id.desc())
            .limit(per_page).offset((page - 1) * per_page)
        ).all()
        return {"items": [t.to_dict() for t in items], "total": total, "page": page, "per_page": per_page}


@ns.route("/adjustments")
class Adjustments(Resource):
    @roles_required(ROLE_PARENT)
    def post(self):
        """Add points (a bonus) or take some away (a correction). The reason is required and
        shows in the kid's history, so every change is explained."""
        p = Payload()
        child_id = p.integer("child_id")
        amount = p.integer("amount", min_value=-MAX_ADJUSTMENT, max_value=MAX_ADJUSTMENT)
        reason = p.string("reason", max_len=160)
        if amount == 0:
            p.add_error("amount", "Use a number other than zero.")
        p.validate()

        child = family_child_or_404(child_id)
        try:
            if amount > 0:
                entry = ledger.credit(child, amount, TX_ADJUSTMENT, reason, created_by=current_user)
            else:
                entry = ledger.debit(child, -amount, TX_ADJUSTMENT, reason, created_by=current_user)
        except ledger.InsufficientPoints:
            db.session.rollback()
            abort(409, f"{child.display_name} only has {child.points_balance} points. "
                       "A balance can't go below zero.", error="insufficient_points")
        db.session.commit()
        badges.evaluate(child)  # e.g. "Saved up 100"
        return {"transaction": entry.to_dict(), "balance": child.points_balance}, 201

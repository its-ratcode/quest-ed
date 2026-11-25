from flask import request
from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, select, update
from sqlalchemy.orm import joinedload

from ..core.security import family_child_or_404, family_object_or_404, roles_required, transition
from ..core.validation import Payload, query_int
from ..extensions import db
from ..models import (
    REDEMPTION_CANCELLED, REDEMPTION_FULFILLED, REDEMPTION_PENDING, REDEMPTION_STATUSES, ROLE_CHILD, ROLE_PARENT,
    TX_REDEMPTION, TX_REFUND, Redemption, Reward, utcnow,
)
from ..services import audit, badges, goals
from ..services import points as ledger

ns = Namespace("rewards", description="The family's reward shop, and kids spending their points")

MAX_COST = 100000
MAX_STOCK = 10000


def _reward_fields(p, partial):
    """Read a reward's fields from the request. `partial`: only the ones sent (editing)."""
    fields = {}
    if not partial or p.has("title"):
        fields["title"] = p.string("title", max_len=120)
    if not partial or p.has("description"):
        fields["description"] = p.text("description", max_len=1000)
    if not partial or p.has("emoji"):
        fields["emoji"] = p.string("emoji", required=partial, max_len=16, default="🎁")
    if not partial or p.has("cost"):
        fields["cost"] = p.integer("cost", min_value=1, max_value=MAX_COST)
    if not partial or p.has("stock"):  # empty (null) = no limit
        fields["stock"] = p.integer("stock", required=False, min_value=0, max_value=MAX_STOCK)
    if partial and p.has("is_active"):
        fields["is_active"] = p.boolean("is_active", required=True)
    return fields


@ns.route("")
class RewardList(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """The family's rewards, cheapest first. Kids only see the ones in the shop, plus which
        one they're saving for (goal_reward_id); parents also see the ones taken out (last)."""
        stmt = select(Reward).where(Reward.family_id == current_user.family_id)
        if current_user.role == ROLE_CHILD:
            stmt = stmt.where(Reward.is_active.is_(True))
        stmt = stmt.order_by(Reward.is_active.desc(), Reward.cost, Reward.id)
        data = {"items": [r.to_dict() for r in db.session.scalars(stmt)]}
        if current_user.role == ROLE_CHILD:
            goal = goals.savings_goal(current_user)
            data["goal_reward_id"] = goal.id if goal else None
        return data

    @roles_required(ROLE_PARENT)
    def post(self):
        """Add a reward to the shop: title, cost in points, and optionally a description,
        an emoji and how many there are (stock; empty = no limit)."""
        p = Payload()
        fields = _reward_fields(p, partial=False)
        p.validate()
        reward = Reward(family_id=current_user.family_id, **fields)
        db.session.add(reward)
        db.session.commit()
        return {"reward": reward.to_dict()}, 201


@ns.route("/<int:reward_id>")
class RewardResource(Resource):
    @roles_required(ROLE_PARENT)
    def patch(self, reward_id):
        """Change a reward, or put it back in the shop with is_active: true. A new price
        only counts for what's bought from now on."""
        reward = family_object_or_404(Reward, reward_id, "Reward")
        p = Payload()
        fields = _reward_fields(p, partial=True)
        p.validate()
        for name, value in fields.items():
            setattr(reward, name, value)
        db.session.commit()
        return {"reward": reward.to_dict()}

    @roles_required(ROLE_PARENT)
    def delete(self, reward_id):
        """Take a reward out of the shop. It's kept, so what kids bought still shows."""
        reward = family_object_or_404(Reward, reward_id, "Reward")
        reward.is_active = False
        db.session.commit()
        return {"reward": reward.to_dict()}


@ns.route("/<int:reward_id>/redeem")
class Redeem(Resource):
    @roles_required(ROLE_CHILD)
    def post(self, reward_id):
        """A kid buys a reward: the points are taken now, and a parent hands it over later."""
        reward = family_object_or_404(Reward, reward_id, "Reward")
        if not reward.is_active:
            abort(409, "This reward isn't in the shop anymore.", error="reward_inactive")

        # One from the stock, in one step, so two kids can't both get the last one.
        if reward.stock is not None:
            taken = db.session.execute(
                update(Reward).where(Reward.id == reward.id, Reward.stock > 0).values(stock=Reward.stock - 1),
                execution_options={"synchronize_session": False},
            )
            if taken.rowcount != 1:
                db.session.rollback()
                abort(409, "This reward is sold out.", error="out_of_stock")

        redemption = Redemption(family_id=current_user.family_id, reward_id=reward.id, child_id=current_user.id,
                                reward_title=reward.title, reward_emoji=reward.emoji, cost=reward.cost)
        db.session.add(redemption)
        db.session.flush()  # gives the redemption its id for the history entry
        try:
            ledger.debit(current_user, reward.cost, TX_REDEMPTION, f"Bought: {reward.title}",
                         created_by=current_user, redemption_id=redemption.id)
        except ledger.InsufficientPoints:
            db.session.rollback()  # also puts the stock back
            abort(409, f"You need {reward.cost - current_user.points_balance} more points for this.",
                  error="insufficient_points")
        goal_reached = goals.clear_goal(current_user, reward_id=reward.id)  # saved up for it: done
        db.session.commit()
        badges.evaluate(current_user)  # e.g. "First reward"
        db.session.refresh(reward)
        return {"redemption": redemption.to_dict(), "reward": reward.to_dict(),
                "balance": current_user.points_balance, "goal_reached": goal_reached}, 201


@ns.route("/<int:reward_id>/goal")
class Goal(Resource):
    @roles_required(ROLE_CHILD)
    def put(self, reward_id):
        """A kid picks this reward to save up for (instead of any other)."""
        reward = family_object_or_404(Reward, reward_id, "Reward")
        if not reward.is_active:
            abort(409, "This reward isn't in the shop anymore.", error="reward_inactive")
        goals.set_goal(current_user, reward)
        db.session.commit()
        return {"goal": reward.to_dict()}


@ns.route("/goal")
class ClearGoal(Resource):
    @roles_required(ROLE_CHILD)
    def delete(self):
        """Stop saving for a reward."""
        goals.clear_goal(current_user)
        db.session.commit()
        return {"goal": None}


@ns.route("/redemptions")
class RedemptionList(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """Rewards kids bought, a page at a time (?page=, ?per_page=). ?status=pending|fulfilled|
        cancelled|done|all (default all); done is handed over or cancelled, for the history.
        Waiting ones come oldest first, the rest newest first.
        Kids see their own; parents see the family, or one kid with ?child_id=."""
        status = request.args.get("status", "all")
        allowed = (*REDEMPTION_STATUSES, "done", "all")
        if status not in allowed:
            abort(400, f"status must be one of: {', '.join(allowed)}.")

        stmt = select(Redemption).where(Redemption.family_id == current_user.family_id)
        if current_user.role == ROLE_CHILD:
            stmt = stmt.where(Redemption.child_id == current_user.id)
        else:
            child_id = query_int("child_id")
            if child_id is not None:
                stmt = stmt.where(Redemption.child_id == family_child_or_404(child_id).id)
        if status == "done":
            stmt = stmt.where(Redemption.status != REDEMPTION_PENDING)
        elif status != "all":
            stmt = stmt.where(Redemption.status == status)

        page = query_int("page", default=1, min_value=1)
        per_page = query_int("per_page", default=20, min_value=5, max_value=100)
        total = db.session.scalar(select(func.count()).select_from(stmt.subquery()))
        order = ((Redemption.created_at, Redemption.id) if status == REDEMPTION_PENDING
                 else (Redemption.created_at.desc(), Redemption.id.desc()))
        items = db.session.scalars(
            stmt.options(joinedload(Redemption.child), joinedload(Redemption.resolved_by))
            .order_by(*order).limit(per_page).offset((page - 1) * per_page)
        ).all()
        return {"items": [r.to_dict() for r in items], "total": total, "page": page, "per_page": per_page}


@ns.route("/redemptions/<int:redemption_id>/fulfill")
class Fulfill(Resource):
    @roles_required(ROLE_PARENT)
    def post(self, redemption_id):
        """The parent handed the reward over."""
        redemption = family_object_or_404(Redemption, redemption_id, "Redemption")
        if not transition(Redemption, redemption.id, REDEMPTION_PENDING, status=REDEMPTION_FULFILLED,
                          resolved_at=utcnow(), resolved_by_id=current_user.id):
            abort(409, "This has already been handed over or cancelled.")
        audit.record("reward.given", actor=current_user, target_type="redemption", target_id=redemption.id,
                     child_id=redemption.child_id)
        db.session.commit()
        db.session.refresh(redemption)
        return {"redemption": redemption.to_dict()}


@ns.route("/redemptions/<int:redemption_id>/cancel")
class Cancel(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def post(self, redemption_id):
        """Call off a reward that hasn't been handed over: the points go back to the kid,
        and it goes back in stock. Parents can cancel any; a kid only their own."""
        redemption = family_object_or_404(Redemption, redemption_id, "Redemption")
        if current_user.role == ROLE_CHILD and redemption.child_id != current_user.id:
            abort(404, "Redemption not found.")
        if not transition(Redemption, redemption.id, REDEMPTION_PENDING, status=REDEMPTION_CANCELLED,
                          resolved_at=utcnow(), resolved_by_id=current_user.id):
            abort(409, "This has already been handed over or cancelled.")

        child = redemption.child
        if redemption.cost:  # a reward that came free with a badge has nothing to give back
            ledger.credit(child, redemption.cost, TX_REFUND, f"Cancelled: {redemption.reward_title}",
                          created_by=current_user, redemption_id=redemption.id)
        db.session.execute(
            update(Reward).where(Reward.id == redemption.reward_id, Reward.stock.is_not(None))
            .values(stock=Reward.stock + 1),
            execution_options={"synchronize_session": False},
        )
        audit.record("reward.cancelled", actor=current_user, target_type="redemption", target_id=redemption.id,
                     child_id=redemption.child_id, refunded=redemption.cost)
        db.session.commit()
        db.session.refresh(redemption)
        return {"redemption": redemption.to_dict(), "balance": child.points_balance}

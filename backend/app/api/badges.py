from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..core.security import family_child_or_404, family_object_or_404, roles_required
from ..core.validation import Payload, query_int
from ..extensions import db
from ..models import BADGE_RULES, PICTURES, ROLE_CHILD, ROLE_PARENT, TONES, Badge, EarnedBadge, Reward, User
from ..services import audit
from ..services import badges as badge_service
from ..services import categories

ns = Namespace("badges", description="Badges kids earn, and the ones parents make")

MAX_TARGET = 10000
MAX_BONUS_POINTS = 1000


def _active_badge_or_404(badge_id):
    badge = family_object_or_404(Badge, badge_id, "Badge")
    if not badge.is_active:
        abort(404, "Badge not found.")
    return badge


def _fields(p, badge=None):
    """The badge fields that were sent (all of them for a new badge), checked."""
    partial = badge is not None
    fields = {}
    if not partial or p.has("title"):
        fields["title"] = p.string("title", max_len=60)
    if not partial or p.has("description"):
        fields["description"] = p.text("description", max_len=200)
    if not partial or p.has("icon"):
        fields["icon"] = p.choice("icon", PICTURES, required=False, default="star")
    if not partial or p.has("tone"):
        fields["tone"] = p.choice("tone", TONES, required=False, default="mint")
    if not partial or p.has("rule"):
        fields["rule"] = p.choice("rule", BADGE_RULES)
    rule = fields.get("rule", badge.rule if badge else None)

    # A goal number for everything but "manual" (a changed badge keeps its number unless one is
    # sent); a category only for "category_tasks".
    if rule == "manual":
        fields["target"] = None
    elif rule and (not partial or p.has("target") or badge.target is None):
        fields["target"] = p.integer("target", min_value=1, max_value=MAX_TARGET)
    if rule == "category_tasks":
        if not partial or p.has("category") or not badge.category:
            fields["category"] = categories.pick(p, current_user.family_id, current=badge.category if badge else None)
    elif rule:
        fields["category"] = None

    if not partial or p.has("child_id"):
        fields["child_id"] = p.integer("child_id", required=False)
    if not partial or p.has("bonus_points"):
        fields["bonus_points"] = p.integer("bonus_points", required=False, min_value=0,
                                           max_value=MAX_BONUS_POINTS, default=0) or 0
    if not partial or p.has("bonus_reward_id"):
        fields["bonus_reward_id"] = p.integer("bonus_reward_id", required=False)
    p.validate()

    if fields.get("child_id") is not None:
        family_child_or_404(fields["child_id"])
    if fields.get("bonus_reward_id") is not None:
        reward = family_object_or_404(Reward, fields["bonus_reward_id"], "Reward")
        if not reward.is_active:
            abort(400, "Please check the highlighted fields.",
                  errors={"bonus_reward_id": "That reward is hidden from the kids. Pick another one."})
    return fields


def _evaluate_family(family_id):
    """Give out the automatic badges the kids have already reached (after badges changed)."""
    for kid in db.session.scalars(select(User).where(User.family_id == family_id, User.role == ROLE_CHILD,
                                                     User.is_active.is_(True))):
        badge_service.evaluate(kid)


@ns.route("/progress")
class Progress(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """A kid's badges with their progress, and their streak. Kids see their own;
        parents pass ?child_id=."""
        if current_user.role == ROLE_CHILD:
            child = current_user
        else:
            child_id = query_int("child_id")
            if child_id is None:
                abort(400, "child_id is required.")
            child = family_child_or_404(child_id)
        badge_service.ensure_badges(child.family_id)
        return dict(badge_service.summary(child), child=child.to_dict())


@ns.route("")
class BadgeList(Resource):
    @roles_required(ROLE_PARENT)
    def get(self):
        """The family's badges, with how many kids earned each."""
        badge_service.ensure_badges(current_user.family_id)
        items = db.session.scalars(
            select(Badge).where(Badge.family_id == current_user.family_id, Badge.is_active.is_(True))
            .order_by(Badge.created_at, Badge.id)).all()
        earned = dict(db.session.execute(
            select(EarnedBadge.badge_id, func.count(EarnedBadge.id))
            .where(EarnedBadge.family_id == current_user.family_id).group_by(EarnedBadge.badge_id)).all())
        return {"items": [dict(b.to_dict(), earned_count=earned.get(b.id, 0),
                               goal=badge_service.describe_rule(b)) for b in items]}

    @roles_required(ROLE_PARENT)
    def post(self):
        """Make a badge. rule: tasks, category_tasks, streak, points, points_saved, routines,
        rewards (each with a "target" number), or manual (a parent gives it)."""
        fields = _fields(Payload())
        badge = Badge(family_id=current_user.family_id, created_by_id=current_user.id, **fields)
        db.session.add(badge)
        db.session.commit()
        _evaluate_family(current_user.family_id)  # kids who already did enough get it now
        return {"badge": badge.to_dict()}, 201


@ns.route("/<int:badge_id>")
class BadgeResource(Resource):
    @roles_required(ROLE_PARENT)
    def patch(self, badge_id):
        """Change a badge. Kids who already earned it keep it."""
        badge = _active_badge_or_404(badge_id)
        fields = _fields(Payload(), badge=badge)
        for field, value in fields.items():
            setattr(badge, field, value)
        db.session.commit()
        _evaluate_family(current_user.family_id)
        return {"badge": badge.to_dict()}

    @roles_required(ROLE_PARENT)
    def delete(self, badge_id):
        """Remove a badge. It's no longer shown; prizes already given stay given."""
        badge = _active_badge_or_404(badge_id)
        badge.is_active = False
        db.session.commit()
        return {"badge": badge.to_dict()}


@ns.route("/starters")
class StarterBadges(Resource):
    @roles_required(ROLE_PARENT)
    def post(self):
        """Bring back the starter badges this family removed. Ones you changed stay as they are."""
        added = badge_service.add_starter_badges(current_user.family_id, created_by=current_user)
        db.session.commit()
        _evaluate_family(current_user.family_id)
        return {"added": [b.to_dict() for b in added]}, 201 if added else 200


@ns.route("/<int:badge_id>/award")
class AwardBadge(Resource):
    @roles_required(ROLE_PARENT)
    def post(self, badge_id):
        """Give a badge to a kid by hand (usually a "manual" one), with its prize."""
        badge = _active_badge_or_404(badge_id)
        p = Payload()
        child_id = p.integer("child_id")
        p.validate()
        child = family_child_or_404(child_id)
        if badge.child_id is not None and badge.child_id != child.id:
            abort(409, "This badge is for a different kid.")
        try:
            given = badge_service.award(child, badge)
            if given:
                audit.record("badge.given", actor=current_user, target_type="badge", target_id=badge.id,
                             child_id=child.id)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()  # given at the same moment by someone else; the prize isn't paid twice
            given = False
        if not given:
            abort(409, f"{child.display_name} already has this badge.", error="already_earned")
        return {"badge": badge.to_dict(), "balance": child.points_balance}, 201

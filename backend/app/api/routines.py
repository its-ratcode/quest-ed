from flask import request
from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import select, update
from sqlalchemy.orm import joinedload

from ..core.security import children_for_new_item, family_child_or_404, family_object_or_404, roles_required
from ..core.validation import Payload
from ..extensions import db
from ..models import (
    ROLE_PARENT, ROUTINE_ACTIVE, ROUTINE_ARCHIVED, ROUTINE_PAUSED, ROUTINE_STATUSES, TASK_ARCHIVED, TASK_OPEN,
    Routine, Task, utcnow,
)
from ..services import categories
from ..services.routines import ensure_family_day, sync_today
from .tasks import MAX_TASK_POINTS

ns = Namespace("routines", description="Tasks that repeat on chosen days")


def _weekdays(p):
    """A list of weekday numbers (0 = Monday … 6 = Sunday) as stored, e.g. [4, 0, 2] → "024"."""
    value = p.data.get("weekdays")
    if (not isinstance(value, list) or not value
            or any(isinstance(d, bool) or not isinstance(d, int) or not 0 <= d <= 6 for d in value)):
        p.add_error("weekdays", "Pick at least one day.")
        return None
    return "".join(str(d) for d in sorted(set(value)))


@ns.route("")
class RoutineList(Resource):
    @roles_required(ROLE_PARENT)
    def get(self):
        """Your family's routines: active and paused ones (?status=active|paused|archived for one kind)."""
        status = request.args.get("status")
        stmt = select(Routine).where(Routine.family_id == current_user.family_id)
        if status is None:
            stmt = stmt.where(Routine.status != ROUTINE_ARCHIVED)
        elif status in ROUTINE_STATUSES:
            stmt = stmt.where(Routine.status == status)
        else:
            abort(400, f"status must be one of: {', '.join(ROUTINE_STATUSES)}.")
        stmt = stmt.options(joinedload(Routine.assigned_to), joinedload(Routine.created_by))
        # Active ones first ("active" < "paused"), then oldest first.
        items = db.session.scalars(stmt.order_by(Routine.status, Routine.created_at, Routine.id)).all()
        return {"items": [r.to_dict() for r in items]}

    @roles_required(ROLE_PARENT)
    def post(self):
        """Make a routine for one kid ("assigned_to_id") or several ("assigned_to_ids": one each).
        If today is one of its days, today's task appears straight away."""
        p = Payload()
        title = p.string("title", max_len=120)
        description = p.text("description", max_len=2000)
        category = categories.pick(p, current_user.family_id, required=False)
        points = p.integer("points", min_value=1, max_value=MAX_TASK_POINTS)
        weekdays = _weekdays(p)
        children = children_for_new_item(p)
        p.validate()

        routines = [Routine(family_id=current_user.family_id, title=title, description=description,
                            category=category, points=points, assigned_to=child, created_by=current_user,
                            weekdays=weekdays) for child in children]
        db.session.add_all(routines)
        db.session.commit()
        ensure_family_day(current_user.family_id, force=True)
        items = [r.to_dict() for r in routines]
        return {"routine": items[0], "routines": items}, 201


@ns.route("/<int:routine_id>")
class RoutineResource(Resource):
    @roles_required(ROLE_PARENT)
    def patch(self, routine_id):
        """Change a routine, pause it ("status": "paused") or resume it ("status": "active").
        Today's task changes too, if the kid hasn't sent it yet."""
        routine = family_object_or_404(Routine, routine_id, "Routine")
        if routine.status == ROUTINE_ARCHIVED:
            abort(409, "This routine was deleted.")

        p = Payload()
        changes = {}
        if p.has("title"):
            changes["title"] = p.string("title", max_len=120)
        if p.has("description"):
            changes["description"] = p.text("description", max_len=2000)
        if p.has("category"):
            changes["category"] = categories.pick(p, current_user.family_id, current=routine.category)
        if p.has("points"):
            changes["points"] = p.integer("points", min_value=1, max_value=MAX_TASK_POINTS)
        if p.has("weekdays"):
            changes["weekdays"] = _weekdays(p)
        if p.has("status"):
            changes["status"] = p.choice("status", (ROUTINE_ACTIVE, ROUTINE_PAUSED))
        new_child_id = p.integer("assigned_to_id") if p.has("assigned_to_id") else None
        p.validate()

        if new_child_id is not None:
            routine.assigned_to = family_child_or_404(new_child_id)
        for field, value in changes.items():
            setattr(routine, field, value)
        sync_today(routine)
        db.session.commit()
        ensure_family_day(current_user.family_id, force=True)  # e.g. resumed, or today was added
        db.session.refresh(routine)
        return {"routine": routine.to_dict()}

    @roles_required(ROLE_PARENT)
    def delete(self, routine_id):
        """Delete a routine. The tasks it made and the points they earned are kept; a copy the
        kid hasn't done yet is archived."""
        routine = family_object_or_404(Routine, routine_id, "Routine")
        routine.status = ROUTINE_ARCHIVED
        db.session.execute(
            update(Task).where(Task.routine_id == routine.id, Task.status == TASK_OPEN)
            .values(status=TASK_ARCHIVED, updated_at=utcnow()),
            execution_options={"synchronize_session": False},
        )
        db.session.commit()
        return {"routine": routine.to_dict()}

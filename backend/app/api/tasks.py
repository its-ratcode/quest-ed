from flask import request
from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from ..core.security import children_for_new_item, family_child_or_404, family_object_or_404, roles_required
from ..core.validation import Payload, query_int
from ..extensions import db
from ..models import ROLE_CHILD, ROLE_PARENT, TASK_APPROVED, TASK_ARCHIVED, TASK_STATUSES, TASK_SUBMITTED, Task
from ..services import categories

ns = Namespace("tasks", description="Tasks parents give their kids")

STATUS_FILTERS = ("active", *TASK_STATUSES, "all")  # "active": everything not archived
MAX_TASK_POINTS = 1000


def _visible_task_or_404(task_id):
    """A task of my family; a kid only sees their own."""
    task = family_object_or_404(Task, task_id, "Task")
    if current_user.role == ROLE_CHILD and task.assigned_to_id != current_user.id:
        abort(404, "Task not found.")
    return task


@ns.route("")
class TaskList(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """Tasks you can see (kids: only their own). Filters: ?status=, ?child_id= (parents),
        ?q= (title search). ?page= (with ?per_page=) returns one page plus the total."""
        status = request.args.get("status", "active")
        if status not in STATUS_FILTERS:
            abort(400, f"status must be one of: {', '.join(STATUS_FILTERS)}.")

        stmt = select(Task).where(Task.family_id == current_user.family_id)
        if current_user.role == ROLE_CHILD:
            stmt = stmt.where(Task.assigned_to_id == current_user.id)
        else:
            child_id = query_int("child_id")
            if child_id is not None:
                stmt = stmt.where(Task.assigned_to_id == family_child_or_404(child_id).id)

        if status == "active":
            stmt = stmt.where(Task.status != TASK_ARCHIVED)
        elif status != "all":
            stmt = stmt.where(Task.status == status)

        # Search the title in any letter case. "%" and "_" in the search are matched as themselves.
        q = (request.args.get("q") or "").strip()[:100]
        if q:
            pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            stmt = stmt.where(Task.title.ilike(pattern, escape="\\"))

        filtered = stmt  # counted for the total, before sorting
        # Coming up first: by due date (undated last), newest first within a day.
        stmt = stmt.order_by(Task.due_date.is_(None), Task.due_date, Task.created_at.desc(), Task.id.desc())
        stmt = stmt.options(joinedload(Task.assigned_to), joinedload(Task.created_by))

        page = query_int("page", min_value=1)
        if page is not None:
            per_page = query_int("per_page", default=20, min_value=5, max_value=100)
            total = db.session.scalar(select(func.count()).select_from(filtered.subquery()))
            tasks = db.session.scalars(stmt.limit(per_page).offset((page - 1) * per_page)).all()
            return {"items": [t.to_dict() for t in tasks], "total": total, "page": page, "per_page": per_page}
        return {"items": [t.to_dict() for t in db.session.scalars(stmt.limit(500))]}

    @roles_required(ROLE_PARENT)
    def post(self):
        """Give a task to one kid ("assigned_to_id") or several ("assigned_to_ids": one copy
        each, so every kid ticks off and earns their own)."""
        p = Payload()
        title = p.string("title", max_len=120)
        description = p.text("description", max_len=2000)
        category = categories.pick(p, current_user.family_id, required=False)
        points = p.integer("points", min_value=1, max_value=MAX_TASK_POINTS)
        due_date = p.date("due_date")
        children = children_for_new_item(p)
        p.validate()

        tasks = [Task(family_id=current_user.family_id, title=title, description=description, category=category,
                      points=points, assigned_to=child, created_by=current_user, due_date=due_date)
                 for child in children]
        db.session.add_all(tasks)
        db.session.commit()
        items = [t.to_dict() for t in tasks]
        return {"task": items[0], "tasks": items}, 201


@ns.route("/<int:task_id>")
class TaskResource(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self, task_id):
        return {"task": _visible_task_or_404(task_id).to_dict()}

    @roles_required(ROLE_PARENT)
    def patch(self, task_id):
        """Edit a task that isn't finished or archived."""
        task = family_object_or_404(Task, task_id, "Task")
        if task.status in (TASK_APPROVED, TASK_ARCHIVED):
            abort(409, "Finished or archived tasks can't be edited.")

        p = Payload()
        changes = {}
        if p.has("title"):
            changes["title"] = p.string("title", max_len=120)
        if p.has("description"):
            changes["description"] = p.text("description", max_len=2000)
        if p.has("category"):
            changes["category"] = categories.pick(p, current_user.family_id, current=task.category)
        if p.has("points"):
            changes["points"] = p.integer("points", min_value=1, max_value=MAX_TASK_POINTS)
        if p.has("due_date"):
            changes["due_date"] = p.date("due_date")
        new_child_id = p.integer("assigned_to_id") if p.has("assigned_to_id") else None
        p.validate()

        if new_child_id is not None and new_child_id != task.assigned_to_id:
            if task.status == TASK_SUBMITTED:
                abort(409, "Approve or send back what the kid sent before giving this task to someone else.")
            task.assigned_to = family_child_or_404(new_child_id)
        for field, value in changes.items():
            setattr(task, field, value)
        db.session.commit()
        return {"task": task.to_dict()}

    @roles_required(ROLE_PARENT)
    def delete(self, task_id):
        """Archive a task. Its history (and any points earned) is kept."""
        task = family_object_or_404(Task, task_id, "Task")
        if task.status == TASK_SUBMITTED:
            abort(409, "Approve or send back what the kid sent first.")
        task.status = TASK_ARCHIVED
        db.session.commit()
        return {"task": task.to_dict()}

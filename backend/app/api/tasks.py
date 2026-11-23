from flask import Response, request
from flask_jwt_extended import current_user
from flask_restx import Namespace, Resource, abort
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload, selectinload

from ..core.security import (
    children_for_new_item, family_child_or_404, family_object_or_404, roles_required, transition,
)
from ..core.validation import Payload, query_int
from ..extensions import db
from ..models import (
    ROLE_CHILD, ROLE_PARENT, SUBMISSION_APPROVED, SUBMISSION_PENDING, SUBMISSION_REJECTED, SUBMISSION_STATUSES,
    TASK_APPROVED, TASK_ARCHIVED, TASK_EXPIRED, TASK_OPEN, TASK_STATUSES, TASK_SUBMITTED, TX_TASK_REWARD, Task,
    TaskSubmission, utcnow,
)
from ..services import badges, categories, photos
from ..services import points as ledger
from ..services.routines import ensure_for_user

ns = Namespace("tasks", description="Tasks parents give their kids")

STATUS_FILTERS = ("active", *TASK_STATUSES, "all")  # "active": everything not archived or expired
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
        ensure_for_user(current_user)  # today's routine tasks, on the first look of the day

        stmt = select(Task).where(Task.family_id == current_user.family_id)
        if current_user.role == ROLE_CHILD:
            stmt = stmt.where(Task.assigned_to_id == current_user.id)
        else:
            child_id = query_int("child_id")
            if child_id is not None:
                stmt = stmt.where(Task.assigned_to_id == family_child_or_404(child_id).id)

        if status == "active":
            stmt = stmt.where(Task.status.not_in((TASK_ARCHIVED, TASK_EXPIRED)))
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
        # Load the people and "I did it"s in a few batched queries, not several per task.
        stmt = stmt.options(
            joinedload(Task.assigned_to), joinedload(Task.created_by),
            selectinload(Task.submissions).joinedload(TaskSubmission.child),
            selectinload(Task.submissions).joinedload(TaskSubmission.reviewed_by),
        )

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
        if task.status in (TASK_APPROVED, TASK_ARCHIVED, TASK_EXPIRED):
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


@ns.route("/<int:task_id>/submit")
class SubmitTask(Resource):
    @roles_required(ROLE_CHILD)
    def post(self, task_id):
        """"I did it": the kid sends their task to a parent to check. Send JSON {note}, or form
        data with "note" and an optional "photo" (JPEG or PNG, up to 5 MB)."""
        task = _visible_task_or_404(task_id)
        is_form = request.mimetype == "multipart/form-data"
        p = Payload(request.form.to_dict()) if is_form else Payload()
        note = p.text("note", max_len=500)
        p.validate()

        upload = request.files.get("photo") if is_form else None
        photo = None
        if upload is not None and upload.filename:
            try:
                photo = photos.save(upload)
            except photos.PhotoError as error:
                abort(400, str(error), errors={"photo": str(error)})

        if not transition(Task, task.id, TASK_OPEN, status=TASK_SUBMITTED, updated_at=utcnow()):
            photos.delete_files([photo])
            abort(409, "This task can't be sent right now.")
        submission = TaskSubmission(task_id=task.id, child_id=current_user.id, note=note, photo=photo)
        db.session.add(submission)
        db.session.commit()
        db.session.refresh(task)
        return {"task": task.to_dict(), "submission": submission.to_dict()}, 201


def _family_submission_or_404(submission_id):
    submission = db.session.get(TaskSubmission, submission_id)
    if submission is None or submission.task.family_id != current_user.family_id:
        abort(404, "Submission not found.")
    return submission


@ns.route("/submissions")
class SubmissionList(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self):
        """"I did it"s (default: those waiting for a parent, oldest first). Kids only see their own.
        ?status=pending|approved|rejected|all, ?child_id= (parents), ?limit= (up to 200)."""
        status = request.args.get("status", SUBMISSION_PENDING)
        allowed = (*SUBMISSION_STATUSES, "all")
        if status not in allowed:
            abort(400, f"status must be one of: {', '.join(allowed)}.")

        stmt = (select(TaskSubmission).join(Task, Task.id == TaskSubmission.task_id)
                .where(Task.family_id == current_user.family_id))
        if current_user.role == ROLE_CHILD:
            stmt = stmt.where(TaskSubmission.child_id == current_user.id)
        else:
            child_id = query_int("child_id")
            if child_id is not None:
                stmt = stmt.where(TaskSubmission.child_id == family_child_or_404(child_id).id)
        if status != "all":
            stmt = stmt.where(TaskSubmission.status == status)

        limit = query_int("limit", default=100, min_value=1, max_value=200)
        order = TaskSubmission.submitted_at.asc() if status == SUBMISSION_PENDING else TaskSubmission.submitted_at.desc()
        stmt = stmt.options(joinedload(TaskSubmission.task), joinedload(TaskSubmission.child),
                            joinedload(TaskSubmission.reviewed_by))
        return {"items": [s.to_dict() for s in db.session.scalars(stmt.order_by(order).limit(limit))]}


@ns.route("/submissions/<int:submission_id>/photo")
class SubmissionPhoto(Resource):
    @roles_required(ROLE_PARENT, ROLE_CHILD)
    def get(self, submission_id):
        """The photo a kid added as proof. For the family's parents and the kid who sent it."""
        submission = _family_submission_or_404(submission_id)
        if current_user.role == ROLE_CHILD and submission.child_id != current_user.id:
            abort(404, "Submission not found.")
        path = photos.path_for(submission.photo)
        if path is None:
            abort(404, "No photo.")
        # Read it into memory (at most 5 MB) so no file stays open: on Windows an open
        # file couldn't be deleted when the kid is removed.
        with open(path, "rb") as fh:
            body = fh.read()
        return Response(body, mimetype=photos.mimetype_for(submission.photo), headers={
            "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@ns.route("/submissions/<int:submission_id>/approve")
class ApproveSubmission(Resource):
    @roles_required(ROLE_PARENT)
    def post(self, submission_id):
        """Approve: the task is done and the kid gets its points. An optional note is shown to the kid."""
        submission = _family_submission_or_404(submission_id)
        p = Payload()
        review_note = p.text("note", max_len=500)
        p.validate()

        task = submission.task
        if not transition(TaskSubmission, submission.id, SUBMISSION_PENDING, status=SUBMISSION_APPROVED,
                          review_note=review_note, reviewed_by_id=current_user.id, reviewed_at=utcnow(),
                          points_awarded=task.points):
            abort(409, "This has already been checked.")
        task.status = TASK_APPROVED
        ledger.credit(submission.child, task.points, TX_TASK_REWARD, f"Completed: {task.title}",
                      created_by=current_user, submission_id=submission.id)
        db.session.commit()
        new_badges = badges.evaluate(submission.child)  # e.g. "First task", or a streak
        db.session.refresh(submission)
        return {"submission": submission.to_dict(), "balance": submission.child.points_balance,
                "new_badges": new_badges}


@ns.route("/submissions/<int:submission_id>/reject")
class RejectSubmission(Resource):
    @roles_required(ROLE_PARENT)
    def post(self, submission_id):
        """Send it back so the kid can try again, with a note saying what's missing."""
        submission = _family_submission_or_404(submission_id)
        p = Payload()
        review_note = p.text("note", max_len=500)
        p.validate()
        if not transition(TaskSubmission, submission.id, SUBMISSION_PENDING, status=SUBMISSION_REJECTED,
                          review_note=review_note, reviewed_by_id=current_user.id, reviewed_at=utcnow()):
            abort(409, "This has already been checked.")
        submission.task.status = TASK_OPEN
        db.session.commit()
        db.session.refresh(submission)
        return {"submission": submission.to_dict()}

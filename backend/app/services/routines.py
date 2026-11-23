"""Routines → each day's tasks.

There is no background job. The first request that needs a family's tasks on a new day (in
the family's time zone) does that day's work:

1. Copies from earlier days that were never sent become "expired": no penalty, and no pile
   of late chores. Ones the kid already sent stay for the parent to check.
2. Each active routine whose days include today gets exactly one task. A unique
   (routine_id, occurrence_date) rule keeps it to one even when two requests race.

The day is then saved on the family (routines_checked_on), so later requests skip the work.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import ROLE_CHILD, ROUTINE_ACTIVE, TASK_EXPIRED, TASK_OPEN, Family, Routine, Task, User, utcnow


def _now():
    """The current time. Tests replace this to move the clock."""
    return datetime.now(timezone.utc)


def family_tz(family):
    """The family's time zone (UTC if it's unknown)."""
    try:
        return ZoneInfo(family.timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def family_today(family):
    """Today's date where the family lives."""
    return _now().astimezone(family_tz(family)).date()


def local_date(moment, tz):
    """The calendar day a stored time (UTC) falls on in a time zone."""
    if moment.tzinfo is None:  # SQLite gives times back without a zone; they're stored in UTC
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(tz).date()


def _copy_for(routine, day):
    return Task(family_id=routine.family_id, title=routine.title, description=routine.description,
                category=routine.category, points=routine.points, assigned_to_id=routine.assigned_to_id,
                created_by_id=routine.created_by_id, due_date=day, occurrence_date=day, routine_id=routine.id)


def ensure_family_day(family_id, force=False):
    """Make today's routine tasks for a family, once per day (or again with force=True,
    after a routine or the time zone changed). Commits."""
    family = db.session.get(Family, family_id)
    if family is None:
        return
    today = family_today(family)
    if not force and family.routines_checked_on == today:
        return

    db.session.execute(
        update(Task)
        .where(Task.family_id == family.id, Task.routine_id.is_not(None), Task.status == TASK_OPEN,
               Task.occurrence_date < today)
        .values(status=TASK_EXPIRED, updated_at=utcnow()),
        execution_options={"synchronize_session": False},
    )
    family.routines_checked_on = today
    db.session.commit()

    made = set(db.session.scalars(
        select(Task.routine_id).where(Task.family_id == family_id, Task.occurrence_date == today,
                                      Task.routine_id.is_not(None))
    ))
    routines = db.session.scalars(
        select(Routine).join(User, User.id == Routine.assigned_to_id)
        .where(Routine.family_id == family_id, Routine.status == ROUTINE_ACTIVE,
               User.role == ROLE_CHILD, User.is_active.is_(True))
    ).all()
    for routine in routines:
        if routine.id in made or not routine.runs_on(today):
            continue
        db.session.add(_copy_for(routine, today))
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()  # another request made it a moment earlier


def ensure_for_user(user):
    """Today's routine tasks for the signed-in person's family, if not made yet."""
    if user is not None and user.family_id is not None:
        ensure_family_day(user.family_id)


def sync_today(routine):
    """After a routine is changed: today's copy (or a later one), if the kid hasn't sent it yet,
    changes with it. The caller commits."""
    db.session.flush()  # so a new kid is in assigned_to_id
    today = family_today(routine.assigned_to.family)
    db.session.execute(
        update(Task)
        .where(Task.routine_id == routine.id, Task.status == TASK_OPEN, Task.occurrence_date >= today)
        .values(title=routine.title, description=routine.description, category=routine.category,
                points=routine.points, assigned_to_id=routine.assigned_to_id, updated_at=utcnow()),
        execution_options={"synchronize_session": False},
    )

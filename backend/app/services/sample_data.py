"""Sample data for trying the app locally. Never for a real site: the command refuses in production.

Builds the Rivera family with two weeks of believable history (tasks, routines, points, rewards,
badges and focus sessions), so every page has something to
show. Sign-ins (local test values only):

  parent   parent@demo.test   demo-parent-2026   (Sam Rivera)
  parent   alex@demo.test     demo-parent-2026   (Alex Rivera, the second parent)
  kid      mia                mia-demo           (Mia)
  kid      leo                leo-demo           (Leo)
  kid      zoe                zoe-demo           (Zoe)
  admin    admin@demo.test    demo-admin-2026    (site administrator)

`flask --app run seed-demo` adds them if they aren't there yet.
`flask --app run seed-demo --reset` first deletes ONLY this family and this admin (found by the
emails above), then builds them again. Other families are never touched.
"""
import random
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import delete, or_, select, update

from ..extensions import db
from ..models import (
    FOCUS_CANCELLED, FOCUS_COMPLETED, REDEMPTION_FULFILLED, REDEMPTION_PENDING, ROLE_ADMIN, ROLE_CHILD, ROLE_PARENT, SUBMISSION_APPROVED,
    SUBMISSION_PENDING, SUBMISSION_REJECTED, TASK_APPROVED, TASK_EXPIRED, TASK_OPEN, TASK_SUBMITTED, TX_ADJUSTMENT,
    TX_REDEMPTION, TX_TASK_REWARD, AuditLog, Badge, Family, FocusSession, Notice, Redemption, Reward, Routine, Task,
    TaskSubmission, User,
)
from . import badges, photos
from . import points as ledger
from .categories import add_starter_categories
from .erase import erase_family
from .routines import ensure_family_day, family_today, family_tz

PARENT_EMAIL = "parent@demo.test"
SECOND_PARENT_EMAIL = "alex@demo.test"
PARENT_PASSWORD = "demo-parent-2026"
ADMIN_EMAIL = "admin@demo.test"
ADMIN_PASSWORD = "demo-admin-2026"
TIMEZONE = "Africa/Tunis"
HISTORY_DAYS = 14

KIDS = [  # username, password, name, avatar
    ("mia", "mia-demo", "Mia", "🦄"),
    ("leo", "leo-demo", "Leo", "🦖"),
    ("zoe", "zoe-demo", "Zoe", "🦊"),
]

ROUTINES = [  # kid, title, category, points, weekdays (0 = Monday), how often it gets done
    ("mia", "Brush teeth before bed", "health", 5, "0123456", 0.9),
    ("mia", "Read for 20 minutes", "learning", 10, "01234", 0.8),
    ("leo", "Feed the cat", "chores", 5, "0123456", 0.85),
    ("leo", "Pack your school bag", "chores", 5, "01234", 0.7),
    ("zoe", "Make your bed", "chores", 5, "0123456", 0.75),
    ("zoe", "Put toys away", "chores", 5, "0123456", 0.6),
]

ONE_OFF = [  # kid, title, category, points, days ago (negative: due later), what happened
    ("mia", "Tidy your desk", "chores", 25, 12, "approved"),
    ("mia", "Finish the science poster", "learning", 30, 6, "approved"),
    ("mia", "Write a thank-you card to Grandma", "kindness", 15, 3, "approved"),
    ("mia", "Practice piano for 15 minutes", "creativity", 10, 0, "submitted"),
    ("mia", "Help wash the car", "chores", 20, -2, "open"),
    ("leo", "Help set the table", "kindness", 10, 9, "approved"),
    ("leo", "Practice spelling words", "learning", 20, 5, "sent_back_then_approved"),
    ("leo", "Water the plants", "chores", 10, 1, "approved"),
    ("leo", "Build the bird feeder", "creativity", 25, 0, "submitted"),
    ("leo", "Clean your room", "chores", 20, -1, "open"),
    ("zoe", "Draw a picture for the fridge", "creativity", 10, 7, "approved"),
    ("zoe", "Help feed the cat", "kindness", 5, 2, "approved"),
    ("zoe", "Count to 100", "learning", 15, 0, "open"),
]

REWARDS = [  # title, emoji, cost, stock
    ("Extra 30 min screen time", "📱", 30, None),
    ("Pick the movie tonight", "🎬", 50, None),
    ("Stay up 30 min later", "🌙", 60, None),
    ("Pizza night choice", "🍕", 80, None),
    ("Ice cream trip", "🍦", 120, 2),
    ("New book of your choice", "📚", 150, None),
]

REDEMPTIONS = [  # kid, reward, days ago, handed over?
    ("mia", "Pick the movie tonight", 8, True),
    ("leo", "Extra 30 min screen time", 4, True),
    ("mia", "Extra 30 min screen time", 1, False),
]

FAMILY_BADGES = [  # title, description, picture, colour, rule, category, target, kid (None: every kid)
    ("Bookworm", "Five learning tasks approved.", "book", "lilac", "category_tasks", "learning", 5, None),
    ("Cat's best friend", "Fed the cat ten times.", "heart", "sky", "routines", None, 10, "leo"),
    ("Super helper", "For going above and beyond without being asked.", "sparkle", "butter", "manual", None, None,
     None),
    ("Focus champion", "An hour of focus in total.", "clock", "mint", "focus_minutes", None, 60, None),
]

BADGE_PRIZES = {  # badge: (bonus points, free reward or None)
    "Bookworm": (20, None),
    "Focus champion": (0, "Stay up 30 min later"),
    "A whole month": (50, "Ice cream trip"),  # a starter badge still out of reach: a prize to aim for
}


class SampleDataError(Exception):
    """The sample family can't be built here (for example, a sign-in it needs is taken)."""


def _at(day, hour, minute, tz):
    """A UTC time for a clock time on a day where the family lives."""
    return datetime.combine(day, time(hour, minute), tzinfo=tz).astimezone(timezone.utc)


def remove_sample_data():
    """Delete only the sample family and the sample admin. Commits. Returns True if anything was removed."""
    parent = db.session.scalar(select(User).where(User.email == PARENT_EMAIL))
    admin = db.session.scalar(select(User).where(User.email == ADMIN_EMAIL))
    if parent is None and admin is None:
        return False
    photo_names = []
    if parent is not None and parent.family_id is not None:
        photo_names = erase_family(parent.family_id)
    if admin is not None:
        db.session.execute(delete(AuditLog).where(AuditLog.actor_id == admin.id))
        db.session.execute(update(Notice).where(Notice.created_by_id == admin.id).values(created_by_id=None))
        db.session.execute(delete(User).where(User.id == admin.id))
    db.session.commit()
    photos.delete_files(photo_names)
    return True


def _check_sign_ins_are_free():
    """Someone else may already use one of the sample sign-ins (say, a kid called "mia")."""
    taken = db.session.scalars(select(User).where(or_(
        User.email.in_([PARENT_EMAIL, SECOND_PARENT_EMAIL, ADMIN_EMAIL]),
        User.username.in_([username for username, *_ in KIDS]),
    ))).all()
    clashes = [u.email or u.username for u in taken if not (u.role == ROLE_ADMIN and u.email == ADMIN_EMAIL)]
    if clashes:
        raise SampleDataError(
            "These sign-ins are already used by other accounts: " + ", ".join(sorted(clashes))
            + ". Rename or remove those accounts first; the sample family needs them.")


def build_sample_family(reset=False):
    """Build the sample family (see the top of this file). Commits. Returns a short message."""
    removed = remove_sample_data() if reset else False
    if db.session.scalar(select(User.id).where(User.email == PARENT_EMAIL)):
        return "The sample family is already there; nothing changed. Use --reset to build it again."
    _check_sign_ins_are_free()

    rng = random.Random(2026)  # the same history every time
    family = Family(name="The Rivera Family", timezone=TIMEZONE)
    sam = User(role=ROLE_PARENT, email=PARENT_EMAIL, display_name="Sam Rivera", avatar="🌻", family=family)
    alex = User(role=ROLE_PARENT, email=SECOND_PARENT_EMAIL, display_name="Alex Rivera", avatar="🌿", family=family)
    for parent in (sam, alex):
        parent.set_password(PARENT_PASSWORD)
    kids = {}
    for username, password, name, avatar in KIDS:
        kid = User(role=ROLE_CHILD, username=username, display_name=name, avatar=avatar, family=family)
        kid.set_password(password)
        kids[username] = kid
    db.session.add_all([family, sam, alex, *kids.values()])
    if not db.session.scalar(select(User.id).where(User.email == ADMIN_EMAIL)):
        admin = User(role=ROLE_ADMIN, email=ADMIN_EMAIL, display_name="Site Admin", avatar="🛡️")
        admin.set_password(ADMIN_PASSWORD)
        db.session.add(admin)
    db.session.flush()

    add_starter_categories(family.id)
    tz = family_tz(family)
    today = family_today(family)
    events = []  # (when, kind, payload), applied in time order so the balances add up

    # Routines, and their copies for each of the last two weeks' days.
    for username, title, category, pts, weekdays, rate in ROUTINES:
        kid = kids[username]
        routine = Routine(family_id=family.id, title=title, category=category, points=pts, assigned_to=kid,
                          created_by=sam, weekdays=weekdays)
        db.session.add(routine)
        db.session.flush()
        for back in range(HISTORY_DAYS, 0, -1):
            day = today - timedelta(days=back)
            if not routine.runs_on(day):
                continue
            task = Task(family_id=family.id, title=title, category=category, points=pts, assigned_to=kid,
                        created_by=sam, due_date=day, occurrence_date=day, routine_id=routine.id,
                        status=TASK_EXPIRED, created_at=_at(day, 6, 0, tz))
            db.session.add(task)
            if rng.random() < rate:
                sent = _at(day, rng.randint(7, 20), rng.choice((5, 15, 30, 45)), tz)
                events.append((sent, "approve", (task, kid, sent, sent + timedelta(minutes=rng.randint(20, 180)), "")))

    # One-off tasks, each with a different outcome.
    for username, title, category, pts, days_ago, outcome in ONE_OFF:
        kid = kids[username]
        due = today - timedelta(days=days_ago)
        task = Task(family_id=family.id, title=title, category=category, points=pts, assigned_to=kid,
                    created_by=rng.choice((sam, alex)), due_date=due, status=TASK_OPEN,
                    created_at=_at(min(due, today) - timedelta(days=2), 9, 0, tz))
        db.session.add(task)
        if outcome == "approved":
            sent = _at(due, rng.randint(15, 19), 10, tz)
            events.append((sent, "approve", (task, kid, sent, sent + timedelta(hours=1), "Great job!")))
        elif outcome == "sent_back_then_approved":
            first = _at(due - timedelta(days=1), 17, 0, tz)
            events.append((first, "send_back", (task, kid, first, first + timedelta(hours=1),
                                                 "Almost! A few words need another look.")))
            second = _at(due, 18, 0, tz)
            events.append((second, "approve", (task, kid, second, second + timedelta(minutes=40),
                                               "Much better, well done.")))
        elif outcome == "submitted":
            sent = datetime.now(timezone.utc) - timedelta(minutes=rng.randint(20, 120))
            events.append((sent, "submit", (task, kid, sent, None, "")))

    # Rewards; buying them is an event, paid for with points earned before.
    rewards = {}
    for title, emoji, cost, stock in REWARDS:
        rewards[title] = Reward(family_id=family.id, title=title, emoji=emoji, cost=cost, stock=stock)
        db.session.add(rewards[title])
    for username, title, days_ago, handed in REDEMPTIONS:
        events.append((_at(today - timedelta(days=days_ago), 18, 30, tz), "buy", (kids[username], rewards[title], handed)))

    # A welcome bonus for each kid, first thing in their history.
    start = _at(today - timedelta(days=HISTORY_DAYS + 1), 10, 0, tz)
    for kid in kids.values():
        events.append((start, "bonus", (kid, 20, "Welcome to Quest-Ed")))
    db.session.flush()

    def booked_at(event):  # an approval's points arrive when the parent reviews it, not when it was sent
        when, kind, payload = event
        return payload[3] if kind == "approve" else when

    for when, kind, payload in sorted(events, key=booked_at):
        if kind == "approve":
            task, kid, sent, reviewed, note = payload
            reviewer = rng.choice((sam, alex))
            sub = TaskSubmission(task=task, child=kid, status=SUBMISSION_APPROVED, points_awarded=task.points,
                                 reviewed_by=reviewer, submitted_at=sent, reviewed_at=reviewed, review_note=note)
            db.session.add(sub)
            task.status = TASK_APPROVED
            db.session.flush()
            entry = ledger.credit(kid, task.points, TX_TASK_REWARD, f"Completed: {task.title}", created_by=reviewer,
                                  submission_id=sub.id)
            entry.created_at = reviewed
        elif kind == "send_back":
            task, kid, sent, reviewed, note = payload
            db.session.add(TaskSubmission(task=task, child=kid, status=SUBMISSION_REJECTED, reviewed_by=sam,
                                          submitted_at=sent, reviewed_at=reviewed, review_note=note))
            task.status = TASK_OPEN
        elif kind == "submit":
            task, kid, sent, _, _ = payload
            db.session.add(TaskSubmission(task=task, child=kid, status=SUBMISSION_PENDING, submitted_at=sent,
                                          note="All done, can you check?"))
            task.status = TASK_SUBMITTED
        elif kind == "buy":
            kid, reward, handed = payload
            if kid.points_balance < reward.cost:
                continue
            bought = Redemption(family_id=family.id, reward_id=reward.id, child=kid, reward_title=reward.title,
                                reward_emoji=reward.emoji, cost=reward.cost, created_at=when,
                                status=REDEMPTION_FULFILLED if handed else REDEMPTION_PENDING,
                                resolved_at=when + timedelta(hours=2) if handed else None,
                                resolved_by=sam if handed else None)
            db.session.add(bought)
            db.session.flush()
            entry = ledger.debit(kid, reward.cost, TX_REDEMPTION, f"Redeemed: {reward.title}", created_by=kid,
                                 redemption_id=bought.id)
            entry.created_at = when
        elif kind == "bonus":
            kid, amount, reason = payload
            entry = ledger.credit(kid, amount, TX_ADJUSTMENT, reason, created_by=sam)
            entry.created_at = when
        db.session.flush()

    # Focus sessions on some afternoons; a few were stopped early.
    for kid in (kids["mia"], kids["leo"]):
        for back in range(HISTORY_DAYS, 0, -1):
            if rng.random() < 0.35:
                minutes = rng.choice((10, 15, 25))
                started = _at(today - timedelta(days=back), 16, rng.choice((0, 20, 40)), tz)
                db.session.add(FocusSession(
                    family_id=family.id, child_id=kid.id, minutes=minutes,
                    label=rng.choice(("Homework", "Reading", "Piano", "Drawing")),
                    status=FOCUS_COMPLETED if rng.random() < 0.85 else FOCUS_CANCELLED,
                    started_at=started, ended_at=started + timedelta(minutes=minutes)))

    # Badges: the starters every new family gets, plus a few the Riveras made, some with prizes.
    badges.add_starter_badges(family.id, created_by=sam)
    for title, description, icon, tone, rule, category, target, kid in FAMILY_BADGES:
        db.session.add(Badge(family_id=family.id, title=title, description=description, icon=icon, tone=tone,
                             rule=rule, category=category, target=target,
                             child_id=kids[kid].id if kid else None, created_by_id=sam.id))
    db.session.flush()
    for title, (bonus, reward_title) in BADGE_PRIZES.items():
        badge = db.session.scalar(select(Badge).where(Badge.family_id == family.id, Badge.title == title))
        badge.bonus_points = bonus
        badge.bonus_reward_id = rewards[reward_title].id if reward_title else None
    db.session.commit()

    # Mia got "Super helper" by hand; everything else is given out the way the app always does.
    helper = db.session.scalar(select(Badge).where(Badge.family_id == family.id, Badge.title == "Super helper"))
    badges.award(kids["mia"], helper)
    db.session.commit()
    for kid in kids.values():
        badges.evaluate(kid)

    ensure_family_day(family.id, force=True)  # today's routine tasks
    return ("Sample family " + ("rebuilt" if removed else "created")
            + ". The sign-ins are at the top of backend/app/services/sample_data.py.")

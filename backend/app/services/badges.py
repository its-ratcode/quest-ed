"""Badges and streaks, worked out from what kids actually did.

Every badge belongs to one family. A new family starts with a copy of STARTER_BADGES, which
parents can change or remove, and they can make their own. Badges are earned automatically
from the stats below, or given by a parent ("manual").

`evaluate(child)` gives out anything newly reached and is safe to call again and again: a
unique (child, badge) rule stops a badge, and its prize, from being given twice. A streak
counts days (in the family's time zone) on which the kid got something approved; today only
breaks it once today is over.
"""
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import (
    REDEMPTION_CANCELLED, SUBMISSION_APPROVED, TX_BADGE_BONUS, TX_TASK_REWARD, Badge, Category, EarnedBadge,
    PointTransaction, Redemption, Task, TaskSubmission, iso,
)
from . import points as ledger
from .routines import family_today, family_tz, local_date

# What a new family starts with. Only suggestions: once copied, they're ordinary badges.
# starter_key, title, description, rule, target, icon, tone
STARTER_BADGES = (
    ("first_task", "First task", "Had a task approved for the first time.", "tasks", 1, "star", "butter"),
    ("tasks_10", "Ten done", "Had 10 tasks approved.", "tasks", 10, "trophy", "mint"),
    ("tasks_50", "Fifty done", "Had 50 tasks approved.", "tasks", 50, "trophy", "lilac"),
    ("streak_3", "Three days running", "Got something approved three days in a row.", "streak", 3, "sparkle", "sky"),
    ("streak_7", "A full week", "Got something approved seven days in a row.", "streak", 7, "sparkle", "mint"),
    ("streak_30", "A whole month", "Got something approved 30 days in a row.", "streak", 30, "sparkle", "lilac"),
    ("routine_10", "Good habits", "Finished 10 routine tasks.", "routines", 10, "clock", "sky"),
    ("saver_100", "Saved up 100", "Had 100 points saved at once.", "points_saved", 100, "medal", "butter"),
    ("first_reward", "First reward", "Spent points on a reward.", "rewards", 1, "gift", "lilac"),
)

# Which stat each rule counts ("category_tasks" and "manual" work differently).
RULE_STAT = {
    "tasks": "approved",
    "streak": "best_streak",
    "points": "points_earned",
    "points_saved": "max_balance",
    "routines": "routine_approved",
    "rewards": "rewards_bought",
}


def add_starter_badges(family_id, created_by=None):
    """Copy the starter badges this family doesn't have (any more). The caller commits."""
    present = set(db.session.scalars(select(Badge.starter_key).where(
        Badge.family_id == family_id, Badge.is_active.is_(True), Badge.starter_key.is_not(None))))
    added = [Badge(family_id=family_id, title=title, description=description, rule=rule, target=target,
                   icon=icon, tone=tone, starter_key=key, created_by_id=created_by.id if created_by else None)
             for key, title, description, rule, target, icon, tone in STARTER_BADGES if key not in present]
    db.session.add_all(added)
    db.session.flush()
    return added


def ensure_badges(family_id):
    """A family with no badges at all (made before badges existed) gets the starters.
    A family that removed some keeps its choice."""
    if not db.session.scalar(select(Badge.id).where(Badge.family_id == family_id).limit(1)):
        add_starter_badges(family_id)
        db.session.commit()


def _streaks(days, today):
    """(current, best) runs of days in a row."""
    if not days:
        return 0, 0
    ordered = sorted(days)
    best = run = 1
    for before, day in zip(ordered, ordered[1:]):
        run = run + 1 if day - before == timedelta(days=1) else 1
        best = max(best, run)
    day = today if today in days else today - timedelta(days=1)  # today isn't over yet
    current = 0
    while day in days:
        current += 1
        day -= timedelta(days=1)
    return current, best


def child_stats(child):
    """Everything badges count, for one kid."""
    family = child.family
    tz = family_tz(family)
    approved = db.session.execute(
        select(TaskSubmission.submitted_at, Task.routine_id, Task.category)
        .join(Task, Task.id == TaskSubmission.task_id)
        .where(TaskSubmission.child_id == child.id, TaskSubmission.status == SUBMISSION_APPROVED)
    ).all()
    current, best = _streaks({local_date(row.submitted_at, tz) for row in approved}, family_today(family))
    by_category = {}
    for row in approved:
        by_category[row.category] = by_category.get(row.category, 0) + 1
    return {
        "approved": len(approved),
        "routine_approved": sum(1 for row in approved if row.routine_id is not None),
        "by_category": by_category,
        "current_streak": current,
        "best_streak": best,
        "points_earned": db.session.scalar(
            select(func.coalesce(func.sum(PointTransaction.amount), 0))
            .where(PointTransaction.child_id == child.id, PointTransaction.kind == TX_TASK_REWARD)) or 0,
        "max_balance": db.session.scalar(
            select(func.coalesce(func.max(PointTransaction.balance_after), 0))
            .where(PointTransaction.child_id == child.id)) or 0,
        # Rewards that came free with a badge (cost 0) don't count as bought.
        "rewards_bought": db.session.scalar(
            select(func.count(Redemption.id))
            .where(Redemption.child_id == child.id, Redemption.status != REDEMPTION_CANCELLED,
                   Redemption.cost > 0)) or 0,
    }


def badges_for(child):
    """The family's badges that are for this kid (for every kid, or just for them)."""
    return db.session.scalars(
        select(Badge).where(Badge.family_id == child.family_id, Badge.is_active.is_(True),
                            or_(Badge.child_id.is_(None), Badge.child_id == child.id))
        .order_by(Badge.created_at, Badge.id)
    ).all()


def progress(badge, stats):
    """How far the kid is towards a badge (None for "manual" ones)."""
    if badge.rule == "manual":
        return None
    if badge.rule == "category_tasks":
        return stats["by_category"].get(badge.category, 0)
    return stats[RULE_STAT[badge.rule]]


def _earned_ids(child):
    return set(db.session.scalars(select(EarnedBadge.badge_id).where(EarnedBadge.child_id == child.id)))


def evaluate(child, stats=None):
    """Give the kid every automatic badge they've reached, with its prize. Commits.
    Returns the new badges' ids."""
    stats = stats or child_stats(child)
    have = _earned_ids(child)
    reached = [b for b in badges_for(child)
               if b.id not in have and b.target and (progress(b, stats) or 0) >= b.target]
    if not reached:
        return []
    try:
        for badge in reached:
            db.session.add(EarnedBadge(family_id=child.family_id, child_id=child.id, badge_id=badge.id))
            db.session.flush()  # a clash with a request at the same moment shows up here
            grant_bonus(child, badge)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()  # given a moment ago by another request; the prize isn't paid twice
        return []
    return [b.id for b in reached]


def award(child, badge):
    """A parent gives a badge by hand. The caller commits. Returns False if the kid has it already."""
    if badge.id in _earned_ids(child):
        return False
    db.session.add(EarnedBadge(family_id=child.family_id, child_id=child.id, badge_id=badge.id))
    db.session.flush()
    grant_bonus(child, badge)
    return True


def grant_bonus(child, badge):
    """The prize that comes with a badge: extra points, and/or a free reward that then waits for
    a parent to hand over. It's in the same transaction as the badge, so it's never given twice.
    A reward that's hidden or sold out is skipped; the points are still given."""
    if badge.bonus_points:
        ledger.credit(child, badge.bonus_points, TX_BADGE_BONUS, f"Badge bonus: {badge.title}")
    reward = badge.bonus_reward
    if reward is None or not reward.is_active or reward.family_id != child.family_id:
        return
    if reward.stock is not None:
        if reward.stock <= 0:
            return
        reward.stock -= 1
    db.session.add(Redemption(family_id=child.family_id, reward_id=reward.id, child_id=child.id,
                              reward_title=reward.title, reward_emoji=reward.emoji, cost=0))


def describe_rule(badge):
    """The goal in plain words, for a badge without a description."""
    n = badge.target
    if badge.rule == "category_tasks":
        label = db.session.scalar(select(Category.label).where(
            Category.family_id == badge.family_id, Category.key == badge.category)) or badge.category
        return f"Get {n} “{label}” tasks approved."
    return {
        "tasks": f"Get {n} tasks approved.",
        "streak": f"Get something approved {n} days in a row.",
        "points": f"Earn {n} points from tasks.",
        "points_saved": f"Have {n} points saved at once.",
        "routines": f"Finish {n} routine tasks.",
        "rewards": f"Spend points on {n} {'reward' if n == 1 else 'rewards'}.",
    }.get(badge.rule, "")


def summary(child):
    """A kid's badges with their progress, and their streak. Gives out anything just reached."""
    stats = child_stats(child)
    evaluate(child, stats)
    earned = {e.badge_id: e.earned_at for e in db.session.scalars(
        select(EarnedBadge).where(EarnedBadge.child_id == child.id))}
    badges = []
    for badge in badges_for(child):
        value = progress(badge, stats)
        reward = badge.bonus_reward
        badges.append({
            "id": badge.id, "title": badge.title, "description": badge.description or describe_rule(badge),
            "icon": badge.icon, "tone": badge.tone, "manual": badge.rule == "manual",
            "earned_at": iso(earned.get(badge.id)),
            "progress": min(value, badge.target) if value is not None else int(badge.id in earned),
            "target": badge.target or 1,
            "bonus_points": badge.bonus_points or 0,
            "bonus_reward": ({"title": reward.title, "emoji": reward.emoji}
                             if reward is not None and reward.is_active else None),
        })
    return {
        "streak": {"current": stats["current_streak"], "best": stats["best_streak"]},
        "stats": {key: value for key, value in stats.items() if key != "by_category"},
        "badges": badges,
        "earned_count": sum(1 for b in badges if b["earned_at"]),
    }

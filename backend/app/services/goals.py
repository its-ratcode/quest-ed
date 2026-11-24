"""A kid's savings goal: the one reward they're saving up for."""
from ..extensions import db
from ..models import SavingsGoal


def savings_goal(child):
    """The reward the kid is saving for, or None (none picked, or it was taken out of the shop)."""
    goal = db.session.get(SavingsGoal, child.id)
    if goal is None or not goal.reward.is_active or goal.reward.family_id != child.family_id:
        return None
    return goal.reward


def set_goal(child, reward):
    """Save for this reward instead of any other. The caller commits."""
    goal = db.session.get(SavingsGoal, child.id)
    if goal is None:
        db.session.add(SavingsGoal(child_id=child.id, family_id=child.family_id, reward_id=reward.id))
    else:
        goal.reward_id = reward.id


def clear_goal(child, reward_id=None):
    """Stop saving (only if it's for `reward_id`, when given). The caller commits. Returns True if one was cleared."""
    goal = db.session.get(SavingsGoal, child.id)
    if goal is None or (reward_id is not None and goal.reward_id != reward_id):
        return False
    db.session.delete(goal)
    return True

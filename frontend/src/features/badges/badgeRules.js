import { formatNumber } from '../../utils/format'

/** How a badge is earned, as parents pick it. `unit` names the goal number. */
export const BADGE_RULES = {
  tasks: { label: 'Any approved tasks', unit: 'tasks approved', one: 'task approved' },
  category_tasks: { label: 'Tasks of one kind', unit: 'tasks approved', one: 'task approved' },
  streak: { label: 'Days in a row', unit: 'days in a row', one: 'day' },
  points: { label: 'Points earned', unit: 'points from tasks', one: 'point from tasks' },
  points_saved: { label: 'Points saved up at once', unit: 'points saved', one: 'point saved' },
  routines: { label: 'Routine tasks done', unit: 'routine tasks', one: 'routine task' },
  rewards: { label: 'Rewards bought', unit: 'rewards', one: 'reward' },
  focus_sessions: { label: 'Focus sessions finished', unit: 'focus sessions', one: 'focus session' },
  focus_minutes: { label: 'Focus minutes', unit: 'minutes of focus', one: 'minute of focus' },
  manual: { label: 'I give it myself', unit: null },
}

/** "+20 points and 🍕 Pizza night", or null when a badge has no prize. */
export function prizeText(badge) {
  const parts = []
  if (badge.bonus_points) parts.push(`+${formatNumber(badge.bonus_points)} points`)
  if (badge.bonus_reward) parts.push(`${badge.bonus_reward.emoji} ${badge.bonus_reward.title}`)
  return parts.length ? parts.join(' and ') : null
}

/** "10 tasks approved", "3 “Learning” tasks approved", or "You give it yourself". */
export function goalText(badge, categoryLabel) {
  if (badge.rule === 'manual') return 'You give it yourself'
  const rule = BADGE_RULES[badge.rule] || {}
  const one = badge.target === 1
  const what = badge.rule === 'category_tasks'
    ? `“${categoryLabel}” ${one ? 'task' : 'tasks'} approved`
    : (one ? rule.one : rule.unit) || ''
  return `${formatNumber(badge.target)} ${what}`
}

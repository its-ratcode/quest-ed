// Monday = 0 … Sunday = 6, like the API.
export const WEEKDAYS = [
  { value: 0, short: 'Mon', long: 'Monday' },
  { value: 1, short: 'Tue', long: 'Tuesday' },
  { value: 2, short: 'Wed', long: 'Wednesday' },
  { value: 3, short: 'Thu', long: 'Thursday' },
  { value: 4, short: 'Fri', long: 'Friday' },
  { value: 5, short: 'Sat', long: 'Saturday' },
  { value: 6, short: 'Sun', long: 'Sunday' },
]

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

/** Quick choices in the day picker. */
export const WEEKDAY_PRESETS = [
  ['Every day', EVERY_DAY],
  ['School days', [0, 1, 2, 3, 4]],
  ['Weekends', [5, 6]],
]

/** "Every day", "School days", "Weekends" or "Mon, Wed, Fri". */
export function describeWeekdays(days = []) {
  const sorted = [...days].sort((a, b) => a - b)
  const preset = WEEKDAY_PRESETS.find(([, preset]) => preset.join() === sorted.join())
  return preset ? preset[0] : sorted.map((d) => WEEKDAYS[d]?.short).join(', ')
}

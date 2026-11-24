// Small date helpers for "today" and "this week" (calendar dates where the reader is, Monday first).

export function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayIso() {
  return isoDate(new Date())
}

/** The 7 days (Mon–Sun) of this week as { iso, weekday (0 = Mon), label, date, isToday }. */
export function currentWeek(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const today = isoDate(now)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = isoDate(d)
    return { iso, weekday: i, label: d.toLocaleDateString(undefined, { weekday: 'short' }), date: d.getDate(), isToday: iso === today }
  })
}

/** The local date (YYYY-MM-DD) of a stored time. */
export function localDayOf(timestamp) {
  return timestamp ? isoDate(new Date(timestamp)) : null
}

const numberFormat = new Intl.NumberFormat()

/** 26596 → "26,596" (in the reader's own style). Use for every number shown to people. */
export function formatNumber(value) {
  return numberFormat.format(Number(value) || 0)
}

/** 1 → "1 pt", 25 → "25 pts". */
export function formatPoints(value) {
  const n = Number(value) || 0
  return `${numberFormat.format(n)} pt${Math.abs(n) === 1 ? '' : 's'}`
}

/** A change in points with its sign: 15 → "+15", -4 → "−4" (a real minus sign). */
export function signedPoints(value) {
  const n = Number(value) || 0
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${numberFormat.format(Math.abs(n))}`
}

/** "YYYY-MM-DD" as a calendar day in the reader's time zone (not UTC midnight). */
export function parseDateOnly(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "2026-12-01" → "Tue, Dec 1" (in the reader's own style). */
export function formatDate(value, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!value) return ''
  return parseDateOnly(value).toLocaleDateString(undefined, options)
}

/** "Good morning", "Good afternoon" or "Good evening", by the reader's own clock. */
export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** How long ago something happened: "just now", "5 min ago", "3h ago", "2d ago", then the date. */
export function relativeTime(value, now = new Date()) {
  if (!value) return ''
  const seconds = Math.round((now - new Date(value)) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** How a due date reads today: { label: 'Due tomorrow', tone: 'soon' | 'later' | 'late' }. */
export function dueInfo(dueDate, today = new Date()) {
  if (!dueDate) return null
  const due = parseDateOnly(dueDate)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((due - start) / 86400000)
  if (diff < 0) return { label: diff === -1 ? 'Was due yesterday' : `Was due ${formatDate(dueDate)}`, tone: 'late' }
  if (diff === 0) return { label: 'Due today', tone: 'soon' }
  if (diff === 1) return { label: 'Due tomorrow', tone: 'soon' }
  return { label: `Due ${formatDate(dueDate)}`, tone: 'later' }
}

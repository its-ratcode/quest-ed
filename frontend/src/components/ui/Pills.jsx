import { formatPoints } from '../../utils/format'

/** "25 pts", in the points style. */
export function PointsPill({ value, label }) {
  return (
    <span className="points-pill" aria-label={label || formatPoints(value)}>
      {formatPoints(value)}
    </span>
  )
}

/** A coloured status label. `map`: status → { label, tone }. */
export function StatusPill({ status, map }) {
  const info = map[status] || { label: status, tone: 'muted' }
  return <span className={`pill pill-${info.tone}`}>{info.label}</span>
}

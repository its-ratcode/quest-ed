/** A thin bar showing how far along something is. tone: mint | lilac | sky | butter. */
export function ProgressBar({ value, max, label, tone }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={`progress-bar${tone ? ` ${tone}` : ''}`} role="progressbar" aria-valuemin={0}
      aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

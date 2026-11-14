/** A whole-page "Loading…" message, announced to screen readers. */
export function FullPageSpinner({ label = 'Loading' }) {
  return (
    <div className="full-center">
      <p className="loading-text" role="status">{label}…</p>
    </div>
  )
}

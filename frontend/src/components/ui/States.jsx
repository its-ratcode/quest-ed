import { getErrorMessage } from '../../utils/errors'

/** A few soft placeholder bars in the shape of content (screen readers hear the label). */
export function LoadingState({ label = 'Loading', rows = 3 }) {
  return (
    <div className="loading-block" role="status" aria-label={`${label}…`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span className="skeleton skeleton-icon" />
          <span className="skeleton-lines">
            <span className="skeleton" style={{ width: `${78 - (i % 3) * 14}%` }} />
            <span className="skeleton" style={{ width: `${46 - (i % 2) * 10}%` }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** Nothing here yet, with what to do about it. */
export function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {message && <p className="text-2 small-text" style={{ maxWidth: 460 }}>{message}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** Loading failed, with a "Try again" button. */
export function ErrorState({ error, onRetry, title = "Couldn't load this" }) {
  return (
    <div className="empty-state" role="alert">
      <h3>{title}</h3>
      <p className="text-2 small-text">{getErrorMessage(error)}</p>
      {onRetry && (
        <button type="button" className="btn secondary small" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}

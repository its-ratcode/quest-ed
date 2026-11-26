import { useEffect, useState } from 'react'
import { siteApi } from '../../api/site'

const STORAGE_KEY = 'questEd.dismissedNotices'

function readDismissed() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

/** The administrator's notices for this person. A dismissed notice stays hidden on this device. */
export default function NoticeBanner() {
  const [notices, setNotices] = useState([])
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const controller = new AbortController()
    siteApi
      .notices(controller.signal)
      .then((data) => setNotices(data.items || []))
      .catch(() => {}) // no banner is better than an error about a banner
    return () => controller.abort()
  }, [])

  function dismiss(id) {
    const next = [...dismissed, id].slice(-50)
    setDismissed(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage is off: it's hidden until the next visit.
    }
  }

  const visible = notices.filter((n) => !dismissed.includes(n.id))
  if (visible.length === 0) return null

  return (
    <div className="stack-sm mb-3">
      {visible.map((n) => (
        <div key={n.id} className={`alert-soft ${n.level === 'warning' ? 'warn' : 'info'} d-flex gap-3 align-items-center`}
          role="status">
          <span className="flex-grow-1">{n.message}</span>
          <button type="button" className="text-link" onClick={() => dismiss(n.id)} aria-label="Dismiss this notice">
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}

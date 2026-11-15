import { useCallback, useMemo, useRef, useState } from 'react'
import { ToastContext } from './toastContext'

/** Shows short messages in a corner; they disappear by themselves (errors stay a little longer). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback((message, tone = 'info', timeout = 4500) => {
    idRef.current += 1
    const id = idRef.current
    setToasts((list) => [...list.slice(-3), { id, message, tone }])
    if (timeout) setTimeout(() => dismiss(id), timeout)
  }, [dismiss])

  const api = useMemo(() => ({
    show,
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error', 7000),
    info: (message) => show(message, 'info'),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-fr ${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

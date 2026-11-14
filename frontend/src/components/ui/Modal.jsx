import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * An accessible dialog: keyboard focus stays inside, Escape closes it, and focus goes
 * back where it was afterwards. size="lg" for long forms (680px instead of 490px).
 */
export default function Modal({ open, title, description, onClose, children, footer, busy = false, size }) {
  const panelRef = useRef(null)
  const titleId = useId()
  const descId = useId()
  // Kept in refs so the keyboard handler always uses the latest values without re-binding.
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => {
    onCloseRef.current = onClose
    busyRef.current = busy
  })

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    const panel = panelRef.current
    const first = panel?.querySelector('[data-autofocus]') || panel?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event) {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation()
        onCloseRef.current?.()
      } else if (event.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll(FOCUSABLE))
        if (items.length === 0) return
        const firstItem = items[0]
        const lastItem = items[items.length - 1]
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault()
          lastItem.focus()
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault()
          firstItem.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop-fr"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.()
      }}
    >
      <div
        ref={panelRef}
        className={`modal-panel${size === 'lg' ? ' lg' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="modal-header-fr">
          <div>
            <h2 id={titleId} className="h3 fw-600">{title}</h2>
            {description && <p id={descId} className="text-2 small-text mt-1">{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

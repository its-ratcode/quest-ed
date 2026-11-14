import { useState } from 'react'
import { getErrorMessage } from '../../utils/errors'
import Modal from './Modal'

/** "Are you sure?" for actions that matter. `onConfirm` may return a promise. tone: primary | danger | mint */
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onClose, children,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function handleClose() {
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={handleClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${tone}`} onClick={handleConfirm} disabled={busy} data-autofocus>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {message && <p className="text-2">{message}</p>}
      {children}
      {error && <div className="alert-soft error mt-3" role="alert">{error}</div>}
    </Modal>
  )
}

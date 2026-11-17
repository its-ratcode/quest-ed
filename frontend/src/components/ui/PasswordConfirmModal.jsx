import { useState } from 'react'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { Field } from './Field'
import { fieldProps } from './fieldProps'
import Modal from './Modal'

/**
 * For actions that can't be undone: explain what will happen, then ask for the
 * parent's password. `onConfirm(password)` may throw; a wrong password shows on the field.
 * Rendered only while open, so it starts empty every time.
 */
export default function PasswordConfirmModal({ open, ...props }) {
  if (!open) return null
  return <PasswordConfirmForm {...props} />
}

function PasswordConfirmForm({ title, children, confirmLabel, busyLabel = 'Deleting…', onConfirm, onClose }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    setFormError(null)
    try {
      await onConfirm(password)
    } catch (err) {
      const fieldError = getFieldErrors(err).password
      if (fieldError) setError(fieldError)
      else setFormError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={title} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <div className="alert-soft error mb-3" role="note">{children}</div>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}
        <Field id="confirm-password" label="Your password, to confirm" error={error}>
          <input {...fieldProps('confirm-password', error)} type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn danger" disabled={busy || !password}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

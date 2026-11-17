import { useState } from 'react'
import { familyApi } from '../../api/family'
import { AvatarPicker } from '../../components/ui/AvatarPicker'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import Modal from '../../components/ui/Modal'
import { AVATARS } from '../../utils/avatars'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,29}$/

/**
 * Add a kid's account, or edit one (name, avatar, new password). `onRemove` adds a
 * "Remove" button when editing. Rendered only while open, so the form starts fresh.
 */
export default function ChildFormModal({ open, ...props }) {
  if (!open) return null
  return <ChildForm {...props} />
}

function ChildForm({ child, onClose, onSaved, onRemove }) {
  const editing = Boolean(child)
  const [form, setForm] = useState(editing
    ? { display_name: child.display_name, username: child.username, password: '', avatar: child.avatar }
    : { display_name: '', username: '', password: '', avatar: '🦊' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const local = {}
    if (!form.display_name.trim()) local.display_name = "Enter your child's name."
    if (!editing && !USERNAME_RE.test(form.username.trim().toLowerCase())) {
      local.username = 'Use 3-30 lowercase letters, numbers, dots, dashes or underscores.'
    }
    if ((!editing || form.password) && form.password.length < 6) local.password = 'Use at least 6 characters.'
    setErrors(local)
    if (Object.keys(local).length) return

    setBusy(true)
    setFormError(null)
    try {
      let result
      if (editing) {
        const payload = { display_name: form.display_name.trim(), avatar: form.avatar }
        if (form.password) payload.password = form.password
        result = await familyApi.updateChild(child.id, payload)
      } else {
        result = await familyApi.createChild({
          display_name: form.display_name.trim(),
          username: form.username.trim().toLowerCase(),
          password: form.password,
          avatar: form.avatar,
        })
      }
      onSaved(result.child, editing, Boolean(form.password))
      onClose()
    } catch (error) {
      setErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error))
      setBusy(false)
    }
  }

  return (
    <Modal open title={editing ? `Edit ${child.display_name}` : 'Add a child'} onClose={onClose} busy={busy}
      description={editing ? null : 'Your child signs in with this username and password. No email needed.'}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}
        <Field id="child-name" label="Name" error={errors.display_name}>
          <input {...fieldProps('child-name', errors.display_name)} maxLength={60} value={form.display_name}
            onChange={update('display_name')} data-autofocus />
        </Field>
        {editing ? (
          <p className="small-text text-2 mb-3">Username: <strong>{child.username}</strong></p>
        ) : (
          <Field id="child-username" label="Username" error={errors.username} hint="Lowercase, e.g. mia or leo.r">
            <input {...fieldProps('child-username', errors.username, 'hint')} autoCapitalize="none" autoComplete="off"
              maxLength={30} value={form.username} onChange={update('username')} />
          </Field>
        )}
        <Field id="child-password" label={editing ? 'New password (leave blank to keep)' : 'Password'}
          error={errors.password} hint="At least 6 characters.">
          <input {...fieldProps('child-password', errors.password, 'hint')} type="password" autoComplete="new-password"
            value={form.password} onChange={update('password')} />
        </Field>
        <div className="mb-2">
          <span className="form-label d-block">Avatar</span>
          <AvatarPicker value={form.avatar} options={AVATARS} onChange={(avatar) => setForm((f) => ({ ...f, avatar }))} />
        </div>
        <div className="modal-actions">
          {editing && onRemove && (
            <button type="button" className="btn danger me-auto" onClick={onRemove} disabled={busy}>
              Remove {child.display_name}…
            </button>
          )}
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

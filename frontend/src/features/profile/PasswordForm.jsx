import { useState } from 'react'
import { authApi } from '../../api/auth'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import { useToast } from '../../components/ui/toast/useToast'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

const EMPTY = { current_password: '', new_password: '', confirm: '' }

/** Change your own password (parents and admins; a parent sets kids' passwords). */
export function PasswordForm() {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const local = {}
    if (!form.current_password) local.current_password = 'Enter your current password.'
    if (form.new_password.length < 8) local.new_password = 'Use at least 8 characters.'
    if (form.confirm !== form.new_password) local.confirm = "The passwords don't match."
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    try {
      await authApi.changePassword({ current_password: form.current_password, new_password: form.new_password })
      toast.success('Password updated.')
      setForm(EMPTY)
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form className="card-soft" onSubmit={handleSubmit} noValidate aria-labelledby="pw-title">
      <h2 id="pw-title" className="card-title mb-3">Change password</h2>
      <Field id="pw-current" label="Current password" error={errors.current_password}>
        <input {...fieldProps('pw-current', errors.current_password)} type="password" autoComplete="current-password"
          value={form.current_password} onChange={update('current_password')} />
      </Field>
      <Field id="pw-new" label="New password" error={errors.new_password}>
        <input {...fieldProps('pw-new', errors.new_password)} type="password" autoComplete="new-password"
          value={form.new_password} onChange={update('new_password')} />
      </Field>
      <Field id="pw-confirm" label="Confirm new password" error={errors.confirm}>
        <input {...fieldProps('pw-confirm', errors.confirm)} type="password" autoComplete="new-password"
          value={form.confirm} onChange={update('confirm')} />
      </Field>
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
    </form>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { useAuth } from '../../auth/useAuth'
import { useSiteConfig } from '../../auth/useSiteConfig'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { AuthBrand } from './AuthBrand'

/** First run only: create the administrator who looks after this site. */
export default function SetupPage() {
  const { refreshUser } = useAuth()
  const { refresh } = useSiteConfig()
  const navigate = useNavigate()
  const [form, setForm] = useState({ display_name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const local = {}
    if (!form.display_name.trim()) local.display_name = 'Enter your name.'
    if (!form.email.trim()) local.email = 'Enter your email.'
    if (form.password.length < 12) local.password = 'Use at least 12 characters.'
    else if (form.password !== form.confirm) local.confirm = "The passwords don't match."
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) return

    setBusy(true)
    try {
      await authApi.setup({ display_name: form.display_name.trim(), email: form.email.trim(), password: form.password })
      await refreshUser()
      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (error) {
      if (error?.response?.data?.error === 'already_set_up') {
        await refresh() // someone else got there first; this sends you to sign in
        return
      }
      setErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error, 'Setup failed. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <main className="auth-wrap">
      <AuthBrand />
      <div className="auth-card card-soft">
        <span className="eyebrow">First-time setup</span>
        <h1 className="mt-1">Create the admin account</h1>
        <p className="text-2 small-text mt-1 mb-3">
          This copy of Quest-Ed is new. The admin looks after the site: accounts, sign-ups and notices.
          You can create your own family afterwards with a separate parent account.
        </p>

        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <Field id="setup-name" label="Your name" error={errors.display_name}>
            <input {...fieldProps('setup-name', errors.display_name)} maxLength={60} autoComplete="name"
              value={form.display_name} onChange={update('display_name')} />
          </Field>
          <Field id="setup-email" label="Admin email" error={errors.email}>
            <input {...fieldProps('setup-email', errors.email)} type="email" autoComplete="email" autoCapitalize="none"
              value={form.email} onChange={update('email')} />
          </Field>
          <Field id="setup-password" label="Password" error={errors.password} hint="At least 12 characters.">
            <input {...fieldProps('setup-password', errors.password, true)} type="password" autoComplete="new-password"
              value={form.password} onChange={update('password')} />
          </Field>
          <Field id="setup-confirm" label="Type the password again" error={errors.confirm}>
            <input {...fieldProps('setup-confirm', errors.confirm)} type="password" autoComplete="new-password"
              value={form.confirm} onChange={update('confirm')} />
          </Field>
          <button type="submit" className="btn primary wide mt-2" disabled={busy}>
            {busy ? 'Setting up…' : 'Create admin and finish setup'}
          </button>
        </form>
      </div>
      <p className="small-text text-2 mt-3" style={{ maxWidth: 420, textAlign: 'center' }}>
        Only shown once. After this, the site opens normally and parents can sign up.
      </p>
    </main>
  )
}

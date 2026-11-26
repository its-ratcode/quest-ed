import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { useSiteConfig } from '../../auth/useSiteConfig'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import { safeReturnPath } from '../../routes/safeReturnPath'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { AuthBrand } from './AuthBrand'

export default function LoginPage() {
  const { login, notice } = useAuth()
  const { features } = useSiteConfig()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const local = {}
    if (!form.identifier.trim()) local.identifier = 'Enter your email or username.'
    if (!form.password) local.password = 'Enter your password.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) return

    setBusy(true)
    try {
      await login(form.identifier.trim(), form.password)
      navigate(safeReturnPath(location.state?.from), { replace: true })
    } catch (error) {
      setErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error, 'Sign-in failed. Please try again.'))
      setBusy(false)
    }
  }

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <main className="auth-wrap">
      <AuthBrand />
      <div className="auth-card card-soft">
        <h1>Sign in</h1>
        <p className="text-2 small-text mt-1 mb-3">Parents use their email. Kids use the username a parent made for them.</p>

        {notice && <div className="alert-soft info mb-3" role="status">{notice}</div>}
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <Field id="identifier" label="Email or username" error={errors.identifier}>
            <input {...fieldProps('identifier', errors.identifier)} type="text" autoComplete="username"
              autoCapitalize="none" value={form.identifier} onChange={update('identifier')} />
          </Field>
          <Field id="password" label="Password" error={errors.password}>
            <input {...fieldProps('password', errors.password)} type="password" autoComplete="current-password"
              value={form.password} onChange={update('password')} />
          </Field>
          <button type="submit" className="btn primary wide mt-2" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="small-text text-2 mt-3">
          Forgot your password? Kids, ask a parent to set a new one. Parents, contact the site administrator.
        </p>
      </div>
      {features.registration && (
        <p className="small-text mt-3">
          No account yet? <Link to="/register">Create one for your family</Link>
        </p>
      )}
    </main>
  )
}

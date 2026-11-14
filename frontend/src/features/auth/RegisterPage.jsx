import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { AuthBrand } from './AuthBrand'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ display_name: '', email: '', password: '', family_name: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function validate() {
    const local = {}
    if (!form.display_name.trim()) local.display_name = 'Tell us your name.'
    if (!EMAIL_RE.test(form.email.trim())) local.email = 'Enter a valid email address.'
    if (form.password.length < 8) local.password = 'Use at least 8 characters.'
    if (!form.family_name.trim()) local.family_name = 'Give your family a name.'
    return local
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const local = validate()
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) return

    setBusy(true)
    try {
      // No role is sent: the server always creates a parent account.
      await register({
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        password: form.password,
        family_name: form.family_name.trim(),
      })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error, 'Sign-up failed. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <main className="auth-wrap">
      <AuthBrand />
      <div className="auth-card card-soft">
        <h1>Create a parent account</h1>
        <p className="text-2 small-text mt-1 mb-3">You'll add your kids' accounts after this.</p>

        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <Field id="display_name" label="Your name" error={errors.display_name}>
            <input {...fieldProps('display_name', errors.display_name)} autoComplete="name"
              value={form.display_name} onChange={update('display_name')} />
          </Field>
          <Field id="email" label="Email" error={errors.email}>
            <input {...fieldProps('email', errors.email)} type="email" autoComplete="email"
              value={form.email} onChange={update('email')} />
          </Field>
          <Field id="password" label="Password" error={errors.password} hint="At least 8 characters.">
            <input {...fieldProps('password', errors.password, 'hint')} type="password"
              autoComplete="new-password" value={form.password} onChange={update('password')} />
          </Field>
          <Field id="family_name" label="Family name" error={errors.family_name}
            hint="Shown to everyone in your family, e.g. The Riveras">
            <input {...fieldProps('family_name', errors.family_name, 'hint')}
              value={form.family_name} onChange={update('family_name')} />
          </Field>
          <button type="submit" className="btn primary wide mt-2" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
      <p className="small-text mt-3">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  )
}

import { useState } from 'react'
import { authApi } from '../../api/auth'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import { AvatarPicker } from '../../components/ui/AvatarPicker'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import { useToast } from '../../components/ui/toast/useToast'
import { AVATARS } from '../../utils/avatars'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { PasswordForm } from './PasswordForm'

const ROLE_LABEL = { parent: 'Parent', child: 'Child', admin: 'Administrator' }

/** Your own name, avatar and password. */
export default function ProfilePage() {
  const { user, family, refreshUser } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ display_name: user.display_name, avatar: user.avatar })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const isKid = user.role === 'child'
  const dirty = form.display_name !== user.display_name || form.avatar !== user.avatar

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || !dirty) return
    if (!form.display_name.trim()) {
      setErrors({ display_name: 'Enter a name.' })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      await authApi.updateMe({ display_name: form.display_name.trim(), avatar: form.avatar })
      await refreshUser()
      toast.success('Profile saved.')
    } catch (error) {
      setErrors(getFieldErrors(error))
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="d-flex align-items-center gap-3">
          <Avatar emoji={user.avatar} size="lg" tone={isKid ? 'mint' : 'sam'} />
          <div>
            <h1>{user.display_name}</h1>
            <p>
              {ROLE_LABEL[user.role]}
              {family ? ` · ${family.name}` : ''}
              {isKid ? ` · @${user.username}` : user.email ? ` · ${user.email}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <form className="card-soft" onSubmit={handleSubmit} noValidate aria-labelledby="profile-title">
            <h2 id="profile-title" className="card-title mb-3">Your profile</h2>
            <Field id="profile-name" label="Display name" error={errors.display_name}>
              <input {...fieldProps('profile-name', errors.display_name)} maxLength={60} value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
            </Field>
            <div className="mb-3">
              <span className="form-label d-block">Avatar</span>
              <AvatarPicker value={form.avatar} options={AVATARS} onChange={(avatar) => setForm((f) => ({ ...f, avatar }))} />
            </div>
            <button type="submit" className="btn primary" disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </div>
        <div className="col-lg-5">
          {isKid ? (
            <div className="card-soft card-lilac stack-sm">
              <h2 className="card-title">Need a new password?</h2>
              <p className="small-text text-2">Ask a parent. They can set a new one for you.</p>
            </div>
          ) : (
            <PasswordForm />
          )}
        </div>
      </div>
    </>
  )
}

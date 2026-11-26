import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { Avatar } from '../ui/Avatar'
import { Field } from '../ui/Field'
import { fieldProps } from '../ui/fieldProps'
import Modal from '../ui/Modal'
import { useToast } from '../ui/toast/useToast'

/** While a parent is using one of their kids' accounts: says so, and switches back (with the parent's password). */
export default function ViewingAsBanner() {
  const { user, actingParent } = useAuth()
  const [open, setOpen] = useState(false)
  if (!actingParent) return null
  const parentFirst = actingParent.display_name.split(' ')[0]

  return (
    <>
      <div className="viewing-as" role="status">
        <Avatar emoji={user.avatar} size="sm" />
        <span className="flex-grow-1">
          You're using <strong>{user.display_name}</strong>'s account. Anything you do here is done as {user.display_name}.
        </span>
        <button type="button" className="btn primary small" onClick={() => setOpen(true)}>Back to {parentFirst}</button>
      </div>
      {open && <SwitchBackModal parentFirst={parentFirst} kidName={user.display_name} onClose={() => setOpen(false)} />}
    </>
  )
}

function SwitchBackModal({ parentFirst, kidName, onClose }) {
  const { switchBack } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      await switchBack(password)
      toast.success(`Welcome back, ${parentFirst}.`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(getFieldErrors(err).password || getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Back to ${parentFirst}`} onClose={onClose} busy={busy}
      description="Enter your password, so kids can't switch into the parent account.">
      <form onSubmit={submit} noValidate>
        <Field id="switch-back-password" label={`${parentFirst}'s password`} error={error}>
          <input {...fieldProps('switch-back-password', error)} type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Stay as {kidName}</button>
          <button type="submit" className="btn primary" disabled={busy || !password}>
            {busy ? 'Switching…' : 'Switch back'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

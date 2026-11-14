import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../ui/ConfirmDialog'
import Icon from '../ui/Icon'

/** A sign-out button that asks first. variant="icon" for the sidebar, "wide" for the More page. */
export function SignOutButton({ variant = 'wide' }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      {variant === 'icon' ? (
        <button type="button" className="btn quiet square" onClick={() => setConfirming(true)}
          aria-label="Sign out" title="Sign out">
          <Icon name="logout" size={16} />
        </button>
      ) : (
        <button type="button" className="btn secondary wide mt-3" onClick={() => setConfirming(true)}>
          <Icon name="logout" size={16} /> Sign out
        </button>
      )}
      <ConfirmDialog
        open={confirming}
        title="Sign out?"
        message="You'll need your password to sign back in."
        confirmLabel="Sign out"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await logout()
          navigate('/login', { replace: true })
        }}
      />
    </>
  )
}

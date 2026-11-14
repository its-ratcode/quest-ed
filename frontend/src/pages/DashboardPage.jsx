import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'

/** Temporary page for signed-in people. Replaced by the real dashboards later. */
export default function DashboardPage() {
  const { user, family, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="full-center">
      <div className="card-soft" style={{ width: 'min(100%, 420px)' }}>
        <h1 className="h3 mb-1">Hi {user.display_name}</h1>
        <p className="text-2 small-text mb-3">
          You're signed in{family ? ` to ${family.name}` : ''}. The dashboard comes in a later step.
        </p>
        <button type="button" className="btn secondary wide" onClick={signOut} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </main>
  )
}

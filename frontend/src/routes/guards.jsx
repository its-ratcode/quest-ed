import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { safeReturnPath } from './safeReturnPath'

/** Pages inside need a session confirmed by the server; otherwise sign in and come back. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner label="Checking your session" />
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/**
 * People who arrive on the sign-in or sign-up page already signed in skip it.
 * Someone who signs in or up *on* the page stays put: the page itself then takes them
 * where they're going (back to the page they wanted, or the next step after sign-up).
 */
export function RedirectIfAuthenticated({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  const [arrivedSignedOut, setArrivedSignedOut] = useState(false)
  if (status === 'anonymous' && !arrivedSignedOut) setArrivedSignedOut(true)

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated' && !arrivedSignedOut) {
    return <Navigate to={safeReturnPath(location.state?.from)} replace />
  }
  return children
}

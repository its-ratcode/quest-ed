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

/** Signed-in people skip the sign-in and sign-up pages, and go back to the page they
 *  wanted before signing in (if any). */
export function RedirectIfAuthenticated({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to={safeReturnPath(location.state?.from)} replace />
  return children
}

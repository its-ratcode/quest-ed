import { Link, Outlet } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import BrandMark from '../ui/BrandMark'

/** The frame around the pages for visitors: the logo, the way in, and a short footer. */
export default function PublicLayout() {
  const { status } = useAuth()
  return (
    <>
      <header className="public-header">
        <nav className="public-nav" aria-label="Site">
          <Link to="/" className="brand">
            <BrandMark />
            quest-ed.
          </Link>
          <div className="d-flex gap-2 align-items-center">
            {status === 'authenticated' ? (
              <Link to="/dashboard" className="btn primary small">Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn quiet small">Sign in</Link>
                <Link to="/register" className="btn primary small">
                  <span className="desktop-only">Create an account</span><span className="mobile-only">Sign up</span>
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main id="main" className="public-main">
        <Outlet />
      </main>
      <footer className="public-footer">
        Quest-Ed. A small, open-source app for chores, routines and pocket-sized rewards.
      </footer>
    </>
  )
}

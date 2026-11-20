import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { CategoriesProvider } from '../../features/categories/CategoriesProvider'
import { usePendingApprovals } from '../../features/tasks/usePendingApprovals'
import { formatNumber } from '../../utils/format'
import { initialsOf } from '../../utils/names'
import { Avatar } from '../ui/Avatar'
import Icon from '../ui/Icon'
import { mobileItemsFor, NAV_HEADING, navItemsFor, ROLE_LABEL } from './navigation'
import { SignOutButton } from './SignOutButton'

/** The small dark count beside a menu entry, e.g. how many "I did it"s are waiting. */
function NavCount({ item, approvals }) {
  if (item.badge !== 'approvals' || approvals === 0) return null
  return (
    <span className="nav-count" aria-label={`${approvals} waiting`}>
      {approvals > 99 ? '99+' : approvals}
    </span>
  )
}

/** A kid's points change when a parent approves, so check them again on every page change. */
function useFreshBalance(isKid) {
  const { pathname } = useLocation()
  const { refreshUser } = useAuth()
  const firstPath = useRef(pathname)
  useEffect(() => {
    if (!isKid || pathname === firstPath.current) return // just loaded on sign-in
    firstPath.current = null
    refreshUser().catch(() => {}) // a failed check keeps the last balance
  }, [isKid, pathname, refreshUser])
}

/**
 * The frame around every signed-in page: a sidebar on computers, and on phones a
 * top bar with the logo plus a bottom bar with the main pages. Kids see their points on top.
 */
export default function DashboardLayout() {
  const { user } = useAuth()
  const items = navItemsFor(user)
  const mobileItems = mobileItemsFor(user.role, items)
  const isKid = user.role === 'child'
  const approvals = usePendingApprovals(user.role === 'parent')
  useFreshBalance(isKid)

  return (
    <div className="layout">
      <a href="#main" className="skip-link visually-hidden-focusable">Skip to content</a>

      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/dashboard" className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="sparkle" size={22} /></span>
          quest-ed.
        </Link>
        <div className="nav-label">{NAV_HEADING[user.role]}</div>
        <nav>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-item">
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              <NavCount item={item} approvals={approvals} />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-footer">
          <Link to="/dashboard/profile" aria-label="Your profile">
            <Avatar size="sm" emoji={isKid ? user.avatar : null} tone={isKid ? 'mint' : 'sam'}
              initials={isKid ? null : initialsOf(user.display_name)} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name text-truncate">{user.display_name}</div>
            <div className="user-role">{ROLE_LABEL[user.role]}</div>
          </div>
          <SignOutButton variant="icon" />
        </div>
      </aside>

      <div className="main">
        {/* Only shown where it carries something: the logo on phones (no sidebar there), and
            a kid's points. On computers a parent's pages start straight with the page title. */}
        <header className={`topbar${isKid ? '' : ' topbar-phone-only'}`}>
          <Link to="/dashboard" className="brand mobile-only" aria-label="Quest-Ed home">
            <span className="brand-mark" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
            <span className="brand-name">quest-ed.</span>
          </Link>
          {isKid && (
            <div className="topbar-right">
              <Link to="/dashboard/points" className="pill pill-success points-link"
                aria-label={`Your points: ${formatNumber(user.points_balance)}. Open My points`}>
                {formatNumber(user.points_balance)} points
              </Link>
            </div>
          )}
        </header>

        <main id="main" className="main-inner" tabIndex={-1}>
          {/* Keyed by account, so nothing loaded for one account is shown to the next. */}
          <CategoriesProvider key={user.id} enabled={user.role !== 'admin'}>
            <Outlet />
          </CategoriesProvider>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        {mobileItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="bottom-item">
            <Icon name={item.icon} size={20} />
            {item.short || item.label}
            {item.badge === 'approvals' && approvals > 0 && <span className="count-badge">{approvals}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

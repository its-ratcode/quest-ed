import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { initialsOf } from '../../utils/names'
import { Avatar } from '../ui/Avatar'
import Icon from '../ui/Icon'
import { mobileItemsFor, NAV_HEADING, navItemsFor, ROLE_LABEL } from './navigation'
import { SignOutButton } from './SignOutButton'

/**
 * The frame around every signed-in page: a sidebar on computers, and on phones a
 * top bar with the logo plus a bottom bar with the main pages.
 */
export default function DashboardLayout() {
  const { user } = useAuth()
  const items = navItemsFor(user)
  const mobileItems = mobileItemsFor(user.role, items)
  const isKid = user.role === 'child'

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
        {/* Phones only: there's no sidebar there, so the logo goes on top. */}
        <header className="topbar topbar-phone-only">
          <Link to="/dashboard" className="brand mobile-only" aria-label="Quest-Ed home">
            <span className="brand-mark" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
            <span className="brand-name">quest-ed.</span>
          </Link>
        </header>

        <main id="main" className="main-inner" tabIndex={-1}>
          {/* Keyed by account, so nothing loaded for one account is shown to the next. */}
          <Outlet key={user.id} />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        {mobileItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="bottom-item">
            <Icon name={item.icon} size={20} />
            {item.short || item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

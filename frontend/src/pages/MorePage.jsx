import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useSiteConfig } from '../auth/useSiteConfig'
import { navItemsFor } from '../components/layout/navigation'
import { SignOutButton } from '../components/layout/SignOutButton'
import Icon from '../components/ui/Icon'

/** The phone menu: every page (the bottom bar only fits a few), and signing out. */
export default function MorePage() {
  const { user, family } = useAuth()
  const { features } = useSiteConfig()
  const items = [...navItemsFor(user, features, family), { to: '/dashboard/profile', label: 'Your profile', icon: 'user' }]

  return (
    <>
      <div className="page-header"><div><h1>Menu</h1></div></div>
      <nav className="card-soft" style={{ padding: '4px 20px' }} aria-label="All pages">
        <ul className="list-plain">
          {items.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="list-row menu-link">
                <Icon name={item.icon} size={18} />
                <span className="flex-grow-1">{item.label}</span>
                <Icon name="chevronRight" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <SignOutButton />
    </>
  )
}

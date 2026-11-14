import { Link } from 'react-router'
import Icon from '../../components/ui/Icon'

/** The logo above the sign-in and sign-up cards; it links home. */
export function AuthBrand() {
  return (
    <Link to="/" className="brand mb-4" style={{ padding: 0 }}>
      <span className="brand-mark" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
      Quest-Ed
    </Link>
  )
}

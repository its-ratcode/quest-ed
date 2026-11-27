import { Link } from 'react-router'
import BrandMark from '../../components/ui/BrandMark'

/** The logo above the sign-in and sign-up cards; it links home. */
export function AuthBrand() {
  return (
    <Link to="/" className="brand mb-4" style={{ padding: 0 }}>
      <BrandMark />
      Quest-Ed
    </Link>
  )
}

import { Link } from 'react-router'
import { EmptyState } from '../components/ui/States'

/** An address that isn't a page. Inside the app it keeps the menu around it. */
export default function NotFoundPage({ inApp = false }) {
  const content = (
    <EmptyState
      title="Page not found"
      message="This link may be old, or the page has moved."
      action={<Link to={inApp ? '/dashboard' : '/'} className="btn secondary small">Back to the start</Link>}
    />
  )
  return inApp ? content : <main className="full-center">{content}</main>
}

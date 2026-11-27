import { Link } from 'react-router'
import { EmptyState } from '../components/ui/States'

/** A page that belongs to another kind of account (the API refuses it as well). */
export default function ForbiddenPage() {
  return (
    <EmptyState
      title="This page isn't for your account"
      message="If you think you should be able to see it, ask a parent or the site administrator."
      action={<Link to="/dashboard" className="btn secondary small">Back to the start</Link>}
    />
  )
}

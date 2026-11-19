import { useAuth } from '../auth/useAuth'
import ApprovalsPanel from '../features/tasks/ApprovalsPanel'

/**
 * Temporary overview, inside the app layout. Parents already get the approval panel from the
 * real Overview; the rest of the dashboards come in a later step.
 */
export default function DashboardPage() {
  const { user, family } = useAuth()
  const isParent = user.role === 'parent'

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hi {user.display_name}</h1>
          <p>You're signed in{family ? ` to ${family.name}` : ''}.</p>
        </div>
      </div>
      {isParent ? (
        <div className="widget-grid">
          <ApprovalsPanel />
        </div>
      ) : (
        <div className="card-soft">
          <p className="text-2">Your dashboard comes in a later step.</p>
        </div>
      )}
    </>
  )
}

import { dashboardApi } from '../api/dashboard'
import { useAuth } from '../auth/useAuth'
import { ErrorState, LoadingState } from '../components/ui/States'
import KidToday from '../features/dashboard/KidToday'
import ApprovalsPanel from '../features/tasks/ApprovalsPanel'
import { useApi } from '../hooks/useApi'

/** A parent's first page until the full Overview arrives: what's waiting for approval. */
function ParentOverview() {
  const { user, family } = useAuth()
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hi {user.display_name}</h1>
          <p>You're signed in{family ? ` to ${family.name}` : ''}.</p>
        </div>
      </div>
      <div className="widget-grid">
        <ApprovalsPanel />
      </div>
    </>
  )
}

/** A kid's Today page, filled from the dashboard summary. */
function KidHome() {
  const { user } = useAuth()
  const summary = useApi((signal) => dashboardApi.summary(signal), [user.id])
  if (summary.loading && !summary.data) return <LoadingState rows={4} label="Loading your day" />
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />
  return <KidToday data={summary.data} reload={summary.reload} />
}

/** The first page after signing in: kids get Today, parents their overview. */
export default function DashboardPage() {
  const { user } = useAuth()
  return user.role === 'child' ? <KidHome /> : <ParentOverview />
}

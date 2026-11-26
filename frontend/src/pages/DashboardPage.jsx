import { dashboardApi } from '../api/dashboard'
import { useAuth } from '../auth/useAuth'
import { ErrorState, LoadingState } from '../components/ui/States'
import AdminOverview from '../features/admin/AdminOverview'
import KidToday from '../features/dashboard/KidToday'
import ParentOverview from '../features/dashboard/ParentOverview'
import { useApi } from '../hooks/useApi'

/** A kid's Today page, filled from the dashboard summary. */
function KidHome() {
  const { user } = useAuth()
  const summary = useApi((signal) => dashboardApi.summary(signal), [user.id])
  if (summary.loading && !summary.data) return <LoadingState rows={4} label="Loading your day" />
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />
  return <KidToday data={summary.data} reload={summary.reload} />
}

/** The first page after signing in: kids get Today, parents their Overview, the admin the site's totals. */
export default function DashboardPage() {
  const { user } = useAuth()
  if (user.role === 'admin') return <AdminOverview />
  return user.role === 'child' ? <KidHome /> : <ParentOverview />
}

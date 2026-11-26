import { adminApi } from '../../api/admin'
import { StatCard } from '../../components/ui/StatCard'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'

/** The administrator's first page: totals across the whole site. */
export default function AdminOverview() {
  const stats = useApi((signal) => adminApi.stats(signal), [])
  if (stats.loading && !stats.data) return <LoadingState rows={2} label="Loading the totals" />
  if (stats.error) return <ErrorState error={stats.error} onRetry={stats.reload} />
  const s = stats.data

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p>Totals across the whole site.</p>
        </div>
      </div>
      <div className="stack">
        <div className="grid-stats">
          <StatCard value={s.families} label="Families" />
          <StatCard value={s.users.parent} label="Parents" />
          <StatCard value={s.users.child} label="Kids" />
          <StatCard value={s.users.admin} label="Admins" />
          <StatCard value={s.inactive_users} label="Switched off" />
        </div>
        <div className="grid-stats">
          <StatCard value={s.tasks} label="Tasks created" tone="sky" />
          <StatCard value={s.approved_submissions} label="Tasks approved" />
          <StatCard value={s.redemptions} label="Rewards bought" />
        </div>
      </div>
    </>
  )
}

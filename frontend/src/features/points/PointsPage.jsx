import { pointsApi } from '../../api/points'
import { StatCard } from '../../components/ui/StatCard'
import { ErrorState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import PointsHistory from './PointsHistory'

/** A kid's own points: what they can spend, and where every point came from or went. */
export default function PointsPage() {
  const summary = useApi((signal) => pointsApi.summary({}, signal), [])

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My points</h1>
          <p>Where your points came from and what you spent them on.</p>
        </div>
      </div>

      {summary.error && <ErrorState error={summary.error} onRetry={summary.reload} />}
      {summary.data && (
        <div className="grid-stats">
          <StatCard value={summary.data.balance} label="To spend" tone="mint" icon="coins" />
          <StatCard value={summary.data.earned_total} label="Earned in total" tone="sky" icon="star" />
          <StatCard value={summary.data.spent_total} label="Spent or taken away" tone="lilac" icon="gift" />
        </div>
      )}

      <div className="widget-grid">
        <section className="card pad widget span-12" aria-labelledby="history-title">
          <div className="section-top">
            <div>
              <h2 id="history-title" className="section-title">History</h2>
              <p className="section-sub">Every change, and why</p>
            </div>
          </div>
          <PointsHistory empty="You get points when a parent approves one of your tasks." />
        </section>
      </div>
    </>
  )
}

import { useState } from 'react'
import { Link } from 'react-router'
import { leaderboardApi } from '../../api/leaderboard'
import { useAuth } from '../../auth/useAuth'
import { useSiteConfig } from '../../auth/useSiteConfig'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { formatNumber } from '../../utils/format'

const PERIODS = [['week', 'This week'], ['month', 'This month']]

/** Who earned the most from approved tasks this week or this month. Parents turn it on in Family. */
export default function LeaderboardPage() {
  const { user, family } = useAuth()
  const { features } = useSiteConfig()
  const isKid = user.role === 'child'

  const header = (
    <div className="page-header">
      <div>
        <h1>Leaderboard</h1>
        <p>A friendly look at points from approved tasks. Spending points never moves anyone down.</p>
      </div>
    </div>
  )
  if (!features.leaderboard) {
    return <>{header}<EmptyState title="Leaderboards are turned off" message="They're switched off on this site for now." /></>
  }
  if (isKid && !family?.leaderboard_enabled) {
    return (
      <>{header}<EmptyState title="Your family hasn't turned on the leaderboard"
        message="Ask a parent if you'd like one." /></>
    )
  }
  return <>{header}<Board isKid={isKid} enabled={Boolean(family?.leaderboard_enabled)} /></>
}

function Board({ isKid, enabled }) {
  const [period, setPeriod] = useState('week')
  const board = useApi((signal) => leaderboardApi.get(period, signal), [period])
  const { features } = useSiteConfig()
  const data = board.data
  const when = period === 'week' ? 'this week' : 'this month'

  return (
    <>
      {!isKid && !enabled && (
        <div className="alert-soft info mb-3">
          Only you can see this for now. <Link to="/dashboard/family">Turn it on in Family</Link> to show it to the kids.
        </div>
      )}
      <div className="tabs mb-3" role="tablist" aria-label="Time period">
        {PERIODS.map(([value, label]) => (
          <button key={value} type="button" role="tab" className="tab" aria-selected={period === value}
            onClick={() => setPeriod(value)}>{label}</button>
        ))}
      </div>

      {board.loading && !data ? (
        <LoadingState label="Loading the leaderboard" />
      ) : board.error ? (
        <ErrorState error={board.error} onRetry={board.reload} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No kids here yet" />
      ) : (
        <div className="widget-grid">
          <section className="card pad widget span-6" aria-labelledby="ranking-title">
            <div className="section-top">
              <div>
                <h2 id="ranking-title" className="section-title">Points from approved tasks</h2>
                <p className="section-sub">Since {period === 'week' ? 'Monday' : 'the 1st'}</p>
              </div>
            </div>
            <ol className="list-plain widget-body limit">
              {data.items.map((row) => (
                <li key={row.child.id} className={`list-row leader-row${row.is_me ? ' is-me' : ''}`}>
                  <span className="rank" aria-label={`Place ${row.rank}`}>{row.rank}</span>
                  <Avatar emoji={row.child.avatar} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-600">{row.child.display_name}{row.is_me ? ' (you)' : ''}</div>
                    <div className="tiny-text text-3">
                      {row.tasks} approved {row.tasks === 1 ? 'task' : 'tasks'} {when}
                      {features.focus_mode && row.focus_minutes > 0 ? ` · ${row.focus_minutes} min of focus` : ''}
                    </div>
                  </div>
                  <span className="leader-points">{formatNumber(row.points)} <small>pts</small></span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card pad widget span-6" aria-labelledby="together-title">
            <div className="section-top">
              <div>
                <h2 id="together-title" className="section-title">Together {when}</h2>
                <p className="section-sub">Everyone's points from approved tasks, added up</p>
              </div>
            </div>
            <p className="mb-2"><span className="big-number">{formatNumber(data.team_points)}</span> <span className="fw-600">pts</span></p>
            <p className="small-text text-2 mb-0">
              Helping, learning and building habits all count. The numbers start again every {period}.
            </p>
          </section>
        </div>
      )}
    </>
  )
}

import { useState } from 'react'
import { Link } from 'react-router'

/** The family's leaderboard switch. Off at first: some families prefer not to compare. */
export function LeaderboardCard({ enabled, onChange }) {
  const [busy, setBusy] = useState(false)

  async function flip() {
    setBusy(true)
    try {
      await onChange(!enabled)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card pad widget span-4" aria-labelledby="lb-title">
      <div className="section-top">
        <div>
          <h2 id="lb-title" className="section-title">Family leaderboard</h2>
          <p className="section-sub">{enabled ? 'Kids can see it' : 'Hidden from kids'}</p>
        </div>
        <button type="button" role="switch" className={`switch${enabled ? ' on' : ''}`} aria-checked={enabled}
          aria-labelledby="lb-title" aria-describedby="lb-help" disabled={busy} onClick={flip} />
      </div>
      <p className="small-text text-2 widget-body" id="lb-help">
        Ranks points from approved tasks this week. Spending points never moves anyone down.
      </p>
      <div className="widget-foot">
        <Link to="/dashboard/leaderboard" className="text-link">See the leaderboard</Link>
      </div>
    </section>
  )
}

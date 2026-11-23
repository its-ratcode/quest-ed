import { badgesApi } from '../../api/badges'
import Icon from '../../components/ui/Icon'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatCard } from '../../components/ui/StatCard'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { formatNumber } from '../../utils/format'
import BadgeEmblem from './BadgeEmblem'
import { prizeText } from './badgeRules'

const earnedOn = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** One badge: earned (with the date), or how far along the kid is. */
function BadgeCard({ badge }) {
  const earned = Boolean(badge.earned_at)
  const prize = prizeText(badge)
  const done = Math.min(badge.progress, badge.target)
  return (
    <article className={`card badge-card${earned ? '' : ' locked'}`} aria-label={badge.title}>
      <BadgeEmblem icon={badge.icon} tone={badge.tone} />
      <h3>{badge.title}</h3>
      {badge.description && <p>{badge.description}</p>}
      {prize && (
        <p className="badge-prize"><Icon name="gift" size={12} /> {earned ? 'Came with' : 'Comes with'} {prize}</p>
      )}
      {earned ? (
        <span className="pill pill-success">Earned {earnedOn(badge.earned_at)}</span>
      ) : badge.manual ? (
        <span className="small-text text-3">A parent gives this one</span>
      ) : (
        <div className="w-100">
          <ProgressBar value={done} max={badge.target} tone={badge.tone}
            label={`${badge.title}: ${done} of ${badge.target}`} />
          <span className="tiny-text text-3">{formatNumber(done)} / {formatNumber(badge.target)}</span>
        </div>
      )}
    </article>
  )
}

/** A kid's own badges: their streak, what they earned, and what's still to get. */
export default function MyBadges() {
  const data = useApi((signal) => badgesApi.progress({}, signal), [])
  const badges = data.data?.badges || []
  const earned = badges.filter((b) => b.earned_at)
  const locked = badges.filter((b) => !b.earned_at)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Badges</h1>
          <p>Badges you have earned, and the ones still to get.</p>
        </div>
      </div>

      {data.loading && !data.data ? (
        <LoadingState label="Loading badges" />
      ) : data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : data.data && (
        <div className="stack">
          <div className="grid-stats">
            <StatCard value={data.data.streak.current} label="Days in a row" tone="butter" icon="sparkle" />
            <StatCard value={`${data.data.earned_count} / ${badges.length}`} label="Badges earned" tone="mint" icon="medal" />
          </div>

          <section aria-labelledby="earned-title">
            <h2 id="earned-title" className="card-title mb-2">Earned</h2>
            {earned.length === 0 ? (
              <p className="small-text text-2">None yet. Your first one comes with your first approved task.</p>
            ) : (
              <div className="badge-grid">{earned.map((b) => <BadgeCard key={b.id} badge={b} />)}</div>
            )}
          </section>

          {locked.length > 0 && (
            <section aria-labelledby="locked-title">
              <h2 id="locked-title" className="card-title mb-2">Still to get</h2>
              <div className="badge-grid">{locked.map((b) => <BadgeCard key={b.id} badge={b} />)}</div>
            </section>
          )}
        </div>
      )}
    </>
  )
}

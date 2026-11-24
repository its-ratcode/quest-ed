import { PointsPill } from '../../components/ui/Pills'
import { formatNumber } from '../../utils/format'

/**
 * One reward in the shop. Kids see "Get this", or how many points they still need and
 * "Save for this". Parents see Edit and Hide (or Show, for one that's hidden from the kids).
 */
export default function RewardCard({
  reward, viewerRole, balance = 0, isGoal = false, onRedeem, onEdit, onToggleActive, onToggleGoal,
}) {
  const outOfStock = reward.stock !== null && reward.stock <= 0
  const missing = Math.max(0, reward.cost - balance)

  return (
    <article className={`card-soft reward-card${reward.is_active ? '' : ' inactive'}`} aria-label={reward.title}>
      <div className="reward-head">
        <span className="reward-emoji" aria-hidden="true">{reward.emoji}</span>
        <div style={{ minWidth: 0 }}>
          <h2 className="h3">{reward.title}</h2>
          {reward.description && <p className="small-text text-2 mt-1 mb-0">{reward.description}</p>}
        </div>
      </div>
      {(reward.stock !== null || !reward.is_active) && (
        <div className="small-text text-2">
          {reward.stock !== null && (outOfStock ? 'None left' : `${formatNumber(reward.stock)} left`)}
          {reward.stock !== null && !reward.is_active && ' · '}
          {!reward.is_active && 'Hidden from kids'}
        </div>
      )}
      <div className="reward-footer">
        <PointsPill value={reward.cost} />
        {viewerRole === 'child' ? (
          outOfStock ? (
            <span className="small-text text-3">None left</span>
          ) : missing === 0 ? (
            <button type="button" className="btn primary small" onClick={() => onRedeem(reward)}
              aria-label={`Get ${reward.title}`}>
              Get this
            </button>
          ) : (
            <div className="d-flex gap-2 align-items-center flex-wrap justify-content-end">
              <span className="small-text text-2" aria-label={`You need ${missing} more points`}>
                {formatNumber(missing)} more to go
              </span>
              <button type="button" className={`btn small ${isGoal ? 'mint' : 'secondary'}`} aria-pressed={isGoal}
                onClick={() => onToggleGoal(reward)} aria-label={`Save for ${reward.title}`}>
                {isGoal ? '★ Saving for this' : 'Save for this'}
              </button>
            </div>
          )
        ) : (
          <div className="d-flex gap-2">
            <button type="button" className="btn secondary small" onClick={() => onEdit(reward)}
              aria-label={`Edit ${reward.title}`}>Edit</button>
            <button type="button" className="btn secondary small" onClick={() => onToggleActive(reward)}
              aria-label={`${reward.is_active ? 'Hide' : 'Show'} ${reward.title}`}>
              {reward.is_active ? 'Hide' : 'Show'}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

import { PointsPill, StatusPill } from '../../components/ui/Pills'
import { relativeTime } from '../../utils/format'
import { REDEMPTION_STATUS } from './rewardOptions'

/**
 * Rewards kids bought. Waiting ones get buttons: parents hand them over or cancel them,
 * a kid can cancel their own. Finished ones just show how they ended.
 */
export default function RedemptionList({ items, viewerRole, onFulfill, onCancel }) {
  const isParent = viewerRole === 'parent'
  return (
    <ul className="list-plain">
      {items.map((r) => {
        const what = isParent && r.child ? `${r.reward_title} for ${r.child.display_name}` : r.reward_title
        return (
          <li key={r.id} className="list-row flex-wrap">
            <div className="flex-grow-1" style={{ minWidth: 160 }}>
              <div className="fw-600">{r.reward_emoji} {r.reward_title}</div>
              <div className="small-text text-2">
                {isParent && r.child ? `${r.child.display_name} · ` : ''}
                {relativeTime(r.created_at)}
              </div>
            </div>
            <PointsPill value={r.cost} />
            {r.status === 'pending' && isParent && onFulfill ? (
              <div className="d-flex gap-2">
                <button type="button" className="btn secondary small" onClick={() => onCancel(r)}
                  aria-label={`Cancel ${what} and refund`}>Cancel and refund</button>
                <button type="button" className="btn primary small" onClick={() => onFulfill(r)}
                  aria-label={`Mark ${what} as given`}>Mark as given</button>
              </div>
            ) : r.status === 'pending' && onCancel ? (
              <div className="d-flex gap-2 align-items-center">
                <StatusPill status={r.status} map={REDEMPTION_STATUS} />
                <button type="button" className="btn secondary small" onClick={() => onCancel(r)}
                  aria-label={`Cancel ${what}`}>Cancel</button>
              </div>
            ) : (
              <StatusPill status={r.status} map={REDEMPTION_STATUS} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

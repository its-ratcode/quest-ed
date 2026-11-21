import { useState } from 'react'
import { rewardsApi } from '../../api/rewards'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { PointsPill, StatusPill } from '../../components/ui/Pills'
import SearchBox from '../../components/ui/SearchBox'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../utils/errors'
import { formatNumber, formatPoints, relativeTime } from '../../utils/format'
import { matches } from '../../utils/search'
import RedeemModal from './RedeemModal'
import RewardCard from './RewardCard'
import RewardFormModal from './RewardFormModal'
import { REDEMPTION_STATUS } from './rewardOptions'

const SEARCH_FROM = 7 // a search box once there are more rewards than fit at a glance

/** What a kid bought that a parent hasn't handed over yet. They can still change their mind. */
function WaitingList({ items, onCancel }) {
  return (
    <ul className="list-plain">
      {items.map((r) => (
        <li key={r.id} className="list-row flex-wrap">
          <div className="flex-grow-1" style={{ minWidth: 160 }}>
            <div className="fw-600">{r.reward_emoji} {r.reward_title}</div>
            <div className="small-text text-2">{relativeTime(r.created_at)}</div>
          </div>
          <PointsPill value={r.cost} />
          <div className="d-flex gap-2 align-items-center">
            <StatusPill status={r.status} map={REDEMPTION_STATUS} />
            <button type="button" className="btn secondary small" onClick={() => onCancel(r)}
              aria-label={`Cancel ${r.reward_title}`}>Cancel</button>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * The reward shop. Kids spend their points here, and can cancel what a parent hasn't
 * handed over yet. Parents add, change and hide rewards.
 */
export default function RewardsPage() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const isParent = user.role === 'parent'
  const balance = user.points_balance || 0

  const rewards = useApi((signal) => rewardsApi.list(signal), [])
  const waiting = useApi(
    (signal) => (isParent ? Promise.resolve(null) : rewardsApi.redemptions({ status: 'pending', per_page: 100 }, signal)),
    [isParent],
  )
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ open: false, reward: null })
  const [redeeming, setRedeeming] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  const items = rewards.data?.items || []
  const shown = items.filter((r) => matches(r.title, query))
  const waitingItems = waiting.data?.items || []
  const newReward = () => setForm({ open: true, reward: null })
  const syncBalance = () => refreshUser().catch(() => {}) // a failed check keeps the last balance

  async function toggleActive(reward) {
    try {
      await rewardsApi.update(reward.id, { is_active: !reward.is_active })
      toast.success(reward.is_active ? 'Hidden from your kids.' : 'Your kids can see it again.')
      rewards.reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{isParent ? 'Rewards' : 'Reward shop'}</h1>
          <p>
            {isParent
              ? 'What your kids can spend their points on. You hand them over in real life.'
              : `You have ${formatPoints(balance)} to spend.`}
          </p>
        </div>
        {isParent && <button type="button" className="btn primary" onClick={newReward}>+ New reward</button>}
      </div>

      <div className="stack">
        <section aria-label="Rewards">
          {rewards.loading && !rewards.data ? (
            <LoadingState rows={3} label="Loading rewards" />
          ) : rewards.error ? (
            <ErrorState error={rewards.error} onRetry={rewards.reload} />
          ) : items.length === 0 ? (
            <div className="card-soft">
              <EmptyState title="No rewards yet"
                message={isParent ? 'Add a few, like extra screen time or choosing dinner.' : 'Ask a parent to add some.'}
                action={isParent && (
                  <button type="button" className="btn secondary small" onClick={newReward}>Add your first reward</button>
                )} />
            </div>
          ) : (
            <>
              {items.length >= SEARCH_FROM && (
                <div className="filter-bar">
                  <SearchBox value={query} onChange={setQuery} label="Search rewards" placeholder="Search rewards" />
                  <span className="small-text text-2">{formatNumber(shown.length)} of {formatNumber(items.length)}</span>
                </div>
              )}
              {shown.length === 0 ? (
                <div className="card-soft">
                  <EmptyState title={`No rewards match “${query}”`} message="Try another word." />
                </div>
              ) : (
                <div className="grid-cards">
                  {shown.map((reward) => (
                    <RewardCard key={reward.id} reward={reward} viewerRole={user.role} balance={balance}
                      onRedeem={setRedeeming} onEdit={(r) => setForm({ open: true, reward: r })}
                      onToggleActive={toggleActive} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {!isParent && waitingItems.length > 0 && (
          <section className="card-soft" aria-labelledby="waiting-title">
            <h2 id="waiting-title" className="card-title mb-3">Waiting to be given</h2>
            <WaitingList items={waitingItems} onCancel={setCancelling} />
          </section>
        )}
      </div>

      {isParent && (
        <RewardFormModal open={form.open} reward={form.reward} onClose={() => setForm({ open: false, reward: null })}
          onSaved={(_reward, edited) => {
            toast.success(edited ? 'Reward updated.' : 'Reward added.')
            rewards.reload()
          }} />
      )}

      <RedeemModal reward={redeeming} balance={balance} onClose={() => setRedeeming(null)}
        onRedeemed={() => {
          syncBalance()
          rewards.reload()
          waiting.reload()
        }} />

      <ConfirmDialog open={Boolean(cancelling)} title="Cancel this?"
        message={cancelling ? `You get your ${formatPoints(cancelling.cost)} back.` : ''}
        confirmLabel="Cancel and get points back" cancelLabel="Keep it"
        onConfirm={async () => {
          await rewardsApi.cancel(cancelling.id)
          toast.success('Cancelled. Your points are back.')
          syncBalance()
          rewards.reload()
          waiting.reload()
        }}
        onClose={() => setCancelling(null)} />
    </>
  )
}

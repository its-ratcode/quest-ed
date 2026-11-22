import { useState } from 'react'
import { rewardsApi } from '../../api/rewards'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import SearchBox from '../../components/ui/SearchBox'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../utils/errors'
import { formatNumber, formatPoints } from '../../utils/format'
import { matches } from '../../utils/search'
import RedeemModal from './RedeemModal'
import RedemptionHistory from './RedemptionHistory'
import RedemptionList from './RedemptionList'
import RewardCard from './RewardCard'
import RewardFormModal from './RewardFormModal'
import { notifyHandoversChanged } from './usePendingHandovers'

const SEARCH_FROM = 7 // a search box once there are more rewards than fit at a glance

/**
 * The reward shop. Kids spend their points here, and can cancel what a parent hasn't
 * handed over yet. Parents add, change and hide rewards, and hand over what kids bought.
 */
export default function RewardsPage() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const isParent = user.role === 'parent'
  const balance = user.points_balance || 0

  const rewards = useApi((signal) => rewardsApi.list(signal), [])
  const waiting = useApi((signal) => rewardsApi.redemptions({ status: 'pending', per_page: 100 }, signal), [])
  const [historyVersion, setHistoryVersion] = useState(0)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ open: false, reward: null })
  const [redeeming, setRedeeming] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  const items = rewards.data?.items || []
  const shown = items.filter((r) => matches(r.title, query))
  const waitingItems = waiting.data?.items || []
  const newReward = () => setForm({ open: true, reward: null })

  /** After buying, handing over or cancelling: everything that shows it, and the kid's points. */
  function refreshAfterChange() {
    rewards.reload() // stock
    waiting.reload()
    setHistoryVersion((v) => v + 1)
    if (isParent) notifyHandoversChanged()
    else refreshUser().catch(() => {}) // a failed check keeps the last balance
  }

  async function toggleActive(reward) {
    try {
      await rewardsApi.update(reward.id, { is_active: !reward.is_active })
      toast.success(reward.is_active ? 'Hidden from your kids.' : 'Your kids can see it again.')
      rewards.reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function fulfill(redemption) {
    try {
      await rewardsApi.fulfill(redemption.id)
      toast.success(`Marked “${redemption.reward_title}” as given.`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
    refreshAfterChange() // also after an error: a kid may have cancelled it meanwhile
  }

  const handOver = isParent && waitingItems.length > 0 && (
    <section className="card-soft" aria-labelledby="handover-title">
      <div className="section-top">
        <h2 id="handover-title" className="card-title">To hand over</h2>
        <span className="count-badge" aria-label={`${waitingItems.length} waiting`}>{waitingItems.length}</span>
      </div>
      <RedemptionList items={waitingItems} viewerRole="parent" onFulfill={fulfill} onCancel={setCancelling} />
    </section>
  )

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
        {handOver}

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
            <RedemptionList items={waitingItems} viewerRole="child" onCancel={setCancelling} />
          </section>
        )}

        <RedemptionHistory viewerRole={user.role} version={historyVersion} />
      </div>

      {isParent && (
        <RewardFormModal open={form.open} reward={form.reward} onClose={() => setForm({ open: false, reward: null })}
          onSaved={(_reward, edited) => {
            toast.success(edited ? 'Reward updated.' : 'Reward added.')
            rewards.reload()
          }} />
      )}

      <RedeemModal reward={redeeming} balance={balance} onClose={() => setRedeeming(null)}
        onRedeemed={refreshAfterChange} />

      <ConfirmDialog open={Boolean(cancelling)} title="Cancel this?"
        message={cancelling && (isParent
          ? `${formatPoints(cancelling.cost)} go back to ${cancelling.child?.display_name}.`
          : `You get your ${formatPoints(cancelling.cost)} back.`)}
        confirmLabel={isParent ? 'Cancel and refund' : 'Cancel and get points back'} cancelLabel="Keep it"
        onConfirm={async () => {
          await rewardsApi.cancel(cancelling.id)
          toast.success(isParent ? 'Cancelled. The points went back.' : 'Cancelled. Your points are back.')
          refreshAfterChange()
        }}
        onClose={() => setCancelling(null)} />
    </>
  )
}

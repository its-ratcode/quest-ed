import { useState } from 'react'
import { badgesApi } from '../../api/badges'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Icon from '../../components/ui/Icon'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../utils/errors'
import { formatNumber } from '../../utils/format'
import { useCategories } from '../categories/useCategories'
import { useKids } from '../family/useKids'
import BadgeFormModal from './BadgeFormModal'
import { goalText, prizeText } from './badgeRules'
import GiveBadgeModal from './GiveBadgeModal'

/** Parents: the badges the kids can earn. Make, change, remove or hand them out. */
export default function ManageBadges() {
  const toast = useToast()
  const cats = useCategories()
  const { kids } = useKids(true)
  const family = useApi((signal) => badgesApi.list(signal), [])
  const [editing, setEditing] = useState(null) // null | 'new' | a badge
  const [removing, setRemoving] = useState(null)
  const [giving, setGiving] = useState(null)
  const badges = family.data?.items || []

  async function restoreStarters() {
    try {
      const { added } = await badgesApi.restoreStarters()
      toast.success(added.length
        ? `Added ${added.length} starter ${added.length === 1 ? 'badge' : 'badges'} back.`
        : 'You already have all the starter badges.')
      family.reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Badges</h1>
          <p>The badges your kids can earn. Change or remove any of them, or make your own.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Make a badge
        </button>
      </div>

      {family.loading && !family.data ? (
        <LoadingState label="Loading badges" />
      ) : family.error ? (
        <ErrorState error={family.error} onRetry={family.reload} />
      ) : badges.length === 0 ? (
        <div className="card-soft">
          <EmptyState title="No badges yet"
            message="Make one for the things your family cares about, like “Bookworm” for 10 reading tasks, or start from the starter set."
            action={<button type="button" className="btn secondary small" onClick={restoreStarters}>Use the starter set</button>} />
        </div>
      ) : (
        <section className="card-soft" aria-label="Your badges">
          <ul className="list-plain">
            {badges.map((b) => {
              const prize = prizeText(b)
              return (
                <li key={b.id} className="list-row flex-wrap">
                  <div className={`task-icon ${b.tone}`} aria-hidden="true"><Icon name={b.icon} size={18} /></div>
                  <div className="flex-grow-1" style={{ minWidth: 180 }}>
                    <div className="fw-600">{b.title}</div>
                    <div className="small-text text-2">
                      {goalText(b, cats.of(b.category).label)} · {b.child ? `only ${b.child.display_name}` : 'every kid'}
                      {' · '}
                      {b.earned_count
                        ? `earned by ${formatNumber(b.earned_count)} ${b.earned_count === 1 ? 'kid' : 'kids'}`
                        : 'not earned yet'}
                      {prize && <span className="d-block"><Icon name="gift" size={12} /> Prize: {prize}</span>}
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    {b.rule === 'manual' && (
                      <button type="button" className="btn mint small" onClick={() => setGiving(b)}
                        aria-label={`Give ${b.title}`}>
                        <Icon name="gift" size={14} /> Give
                      </button>
                    )}
                    <button type="button" className="btn secondary small" onClick={() => setEditing(b)}
                      aria-label={`Edit ${b.title}`}>Edit</button>
                    <button type="button" className="btn danger small" onClick={() => setRemoving(b)}
                      aria-label={`Remove ${b.title}`}>Remove</button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="small-text text-3 mt-2 mb-0">
            Removed a starter badge by mistake?{' '}
            <button type="button" className="text-link small-text" onClick={restoreStarters}>Add the starter badges back</button>
          </p>
        </section>
      )}

      <BadgeFormModal open={editing !== null} badge={editing === 'new' ? null : editing} kids={kids}
        onClose={() => setEditing(null)}
        onSaved={(badge, edited) => {
          toast.success(edited ? 'Badge saved.' : `“${badge.title}” badge created.`)
          family.reload()
        }} />

      <GiveBadgeModal badge={giving} kids={kids} onClose={() => setGiving(null)} onGiven={family.reload} />

      <ConfirmDialog open={Boolean(removing)} title="Remove this badge?" tone="danger" confirmLabel="Remove badge"
        message={removing ? `“${removing.title}” won't be shown any more, also for kids who already earned it.` : ''}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await badgesApi.remove(removing.id)
          toast.success('Badge removed.')
          family.reload()
        }} />
    </>
  )
}

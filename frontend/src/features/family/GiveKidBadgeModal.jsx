import { useState } from 'react'
import { Link } from 'react-router'
import { badgesApi } from '../../api/badges'
import Icon from '../../components/ui/Icon'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast/useToast'
import { getErrorMessage } from '../../utils/errors'

/** On a kid's page: give them one of the hand-out badges they don't have yet. */
export default function GiveKidBadgeModal({ open, kid, badges, onClose, onGiven }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!open) return null

  async function give(badge) {
    setBusy(true)
    try {
      await badgesApi.award(badge.id, kid.id)
      toast.success(`${kid.display_name} got the “${badge.title}” badge.`)
      onGiven()
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Give ${kid.display_name} a badge`} onClose={onClose} busy={busy}
      description="These are the badges you hand out yourself.">
      {badges.length === 0 ? (
        <p className="small-text text-2 mb-0">
          No hand-out badges left for {kid.display_name}. Make one on the <Link to="/dashboard/badges">Badges</Link> page
          and choose “I give it myself”.
        </p>
      ) : (
        <ul className="list-plain">
          {badges.map((b) => (
            <li key={b.id} className="list-row">
              <div className={`task-icon ${b.tone}`} aria-hidden="true"><Icon name={b.icon} size={18} /></div>
              <div className="flex-grow-1">
                <div className="fw-600">{b.title}</div>
                {b.description && <div className="small-text text-2">{b.description}</div>}
              </div>
              <button type="button" className="btn mint small" disabled={busy} onClick={() => give(b)}
                aria-label={`Give ${b.title}`}>Give</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

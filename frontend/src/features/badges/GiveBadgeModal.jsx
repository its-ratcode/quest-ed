import { useState } from 'react'
import { badgesApi } from '../../api/badges'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast/useToast'
import { getErrorMessage } from '../../utils/errors'

/** A parent gives a badge by hand: one button per kid who can get it. Shown while `badge` is set. */
export default function GiveBadgeModal({ badge, kids, onClose, onGiven }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!badge) return null
  const eligible = badge.child ? kids.filter((k) => k.id === badge.child.id) : kids

  async function give(kid) {
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
    <Modal open title={`Give “${badge.title}”`} onClose={onClose} busy={busy}
      description="Pick who gets it. Each kid can get it once.">
      <div className="d-flex gap-2 flex-wrap">
        {eligible.map((kid) => (
          <button key={kid.id} type="button" className="btn secondary" disabled={busy} onClick={() => give(kid)}>
            <span aria-hidden="true">{kid.avatar}</span> {kid.display_name}
          </button>
        ))}
      </div>
    </Modal>
  )
}

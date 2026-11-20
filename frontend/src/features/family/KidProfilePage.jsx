import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { familyApi } from '../../api/family'
import { pointsApi } from '../../api/points'
import { Avatar } from '../../components/ui/Avatar'
import Icon from '../../components/ui/Icon'
import PasswordConfirmModal from '../../components/ui/PasswordConfirmModal'
import { StatCard } from '../../components/ui/StatCard'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { formatNumber } from '../../utils/format'
import AdjustPointsModal from '../points/AdjustPointsModal'
import PointsHistory from '../points/PointsHistory'
import ChildFormModal from './ChildFormModal'

/**
 * One kid, for their parents: their account and their points. Later steps add their
 * tasks, badges and the data export here.
 */
export default function KidProfilePage() {
  const id = Number(useParams().kidId)
  const navigate = useNavigate()
  const toast = useToast()
  const [modal, setModal] = useState(null) // 'edit' | 'points' | 'remove'
  const [changes, setChanges] = useState(0) // bumps after a points change, to reload the history

  const family = useApi((signal) => familyApi.get(signal), [id])
  const summary = useApi((signal) => pointsApi.summary({ child_id: id }, signal), [id, changes])
  const kid = family.data?.members.find((m) => m.id === id && m.role === 'child')

  if (family.loading && !family.data) return <LoadingState rows={3} label="Loading profile" />
  if (family.error) return <ErrorState error={family.error} onRetry={family.reload} />
  if (!kid) {
    return (
      <div className="card-soft">
        <h1 className="h3">Kid not found</h1>
        <p className="text-2 small-text mb-0">
          This account isn't in your family. <Link to="/dashboard/family">Back to Family &amp; kids</Link>
        </p>
      </div>
    )
  }

  const close = () => setModal(null)

  return (
    <>
      <Link to="/dashboard/family" className="text-link mb-2">← Family &amp; kids</Link>

      <div className="page-header">
        <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
          <Avatar emoji={kid.avatar} size="xl" />
          <div style={{ minWidth: 0 }}>
            <h1 className="text-break">{kid.display_name}</h1>
            <p>Signs in as <strong>{kid.username}</strong></p>
          </div>
        </div>
        <button type="button" className="btn secondary" onClick={() => setModal('edit')}>Edit</button>
      </div>

      <div className="toolbar" role="group" aria-label={`Do something for ${kid.display_name}`}>
        <button type="button" className="btn secondary small" onClick={() => setModal('points')}>
          <Icon name="coins" size={14} /> Add or take points
        </button>
      </div>

      <div className="grid-stats">
        <StatCard value={kid.points_balance} label="Points to spend" tone="mint" icon="coins" />
        <StatCard value={summary.data ? summary.data.earned_total : '–'} label="Earned in total" tone="sky" icon="star" />
        <StatCard value={summary.data ? summary.data.spent_total : '–'} label="Spent or taken away" tone="lilac" icon="gift" />
      </div>

      <div className="widget-grid">
        <section className="card pad widget span-12" aria-labelledby="history-title">
          <div className="section-top">
            <div>
              <h2 id="history-title" className="section-title">Points history</h2>
              <p className="section-sub">Every change, and why</p>
            </div>
          </div>
          <PointsHistory childId={kid.id} version={changes}
            empty={`${kid.display_name} gets points when you approve a task, or when you add some here.`} />
        </section>
      </div>

      <AdjustPointsModal open={modal === 'points'} child={kid} onClose={close}
        onDone={(result) => {
          toast.success(`Saved. ${kid.display_name} now has ${formatNumber(result.balance)} points.`)
          setChanges((n) => n + 1)
          family.reload()
        }} />
      <ChildFormModal open={modal === 'edit'} child={kid} onClose={close}
        onSaved={(saved, _edited, newPassword) => {
          toast.success(`${saved.display_name} is updated${newPassword ? ', with the new password' : ''}.`)
          family.reload()
        }}
        onRemove={() => setModal('remove')} />
      <PasswordConfirmModal open={modal === 'remove'} title={`Remove ${kid.display_name}?`}
        confirmLabel="Remove for good" onClose={close}
        onConfirm={async (password) => {
          await familyApi.removeChild(kid.id, password)
          toast.success(`${kid.display_name} was removed.`)
          navigate('/dashboard/family', { replace: true })
        }}>
        This deletes {kid.display_name}'s account and everything about them: tasks, points and photos.
        It can't be undone.
      </PasswordConfirmModal>
    </>
  )
}

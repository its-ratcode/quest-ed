import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { badgesApi } from '../../api/badges'
import { familyApi } from '../../api/family'
import { pointsApi } from '../../api/points'
import { tasksApi } from '../../api/tasks'
import { Avatar } from '../../components/ui/Avatar'
import Icon from '../../components/ui/Icon'
import { CategoryTile } from '../../components/ui/LookPicker'
import PasswordConfirmModal from '../../components/ui/PasswordConfirmModal'
import { StatCard } from '../../components/ui/StatCard'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { kidTone } from '../../utils/avatars'
import { dueInfo, formatNumber } from '../../utils/format'
import { useCategories } from '../categories/useCategories'
import AdjustPointsModal from '../points/AdjustPointsModal'
import PointsHistory from '../points/PointsHistory'
import SubmissionPhoto from '../tasks/SubmissionPhoto'
import { describeWeekdays } from '../tasks/weekdays'
import ChildFormModal from './ChildFormModal'
import ExportModal from './ExportModal'
import GiveKidBadgeModal from './GiveKidBadgeModal'

const shortDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Everything about one kid in one place, and the things a parent does for them. */
export default function KidProfilePage() {
  const id = Number(useParams().kidId)
  const navigate = useNavigate()
  const toast = useToast()
  const cats = useCategories()
  const [modal, setModal] = useState(null) // 'edit' | 'points' | 'badge' | 'export' | 'remove'
  const [changes, setChanges] = useState(0) // bumps after a change, to reload what shows it

  const family = useApi((signal) => familyApi.get(signal), [id])
  const summary = useApi((signal) => pointsApi.summary({ child_id: id }, signal), [id, changes])
  const badges = useApi((signal) => badgesApi.progress({ child_id: id }, signal), [id, changes])
  const todo = useApi((signal) => tasksApi.list({ child_id: id, status: 'active' }, signal), [id])
  const reviewedList = useApi((signal) => tasksApi.submissions({ child_id: id, status: 'all', limit: 12 }, signal), [id])
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
  const changed = () => {
    setChanges((n) => n + 1)
    family.reload()
  }
  const allBadges = badges.data?.badges || []
  const earned = allBadges.filter((b) => b.earned_at)
  const toGive = allBadges.filter((b) => b.manual && !b.earned_at)
  // "active" also has approved one-off tasks; To do is only what's still open or waiting.
  const tasks = (todo.data?.items || []).filter((t) => t.status === 'open' || t.status === 'submitted')
  const waiting = tasks.filter((t) => t.status === 'submitted').length
  const reviewed = (reviewedList.data?.items || []).filter((s) => s.status !== 'pending').slice(0, 8)
  const stats = badges.data?.stats

  return (
    <>
      <Link to="/dashboard/family" className="text-link mb-2">← Family &amp; kids</Link>

      <div className="page-header">
        <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
          <Avatar emoji={kid.avatar} size="xl" tone={kidTone(kid)} />
          <div style={{ minWidth: 0 }}>
            <h1 className="text-break">{kid.display_name}</h1>
            <p>Signs in as <strong>{kid.username}</strong></p>
          </div>
        </div>
        <button type="button" className="btn secondary" onClick={() => setModal('edit')}>Edit</button>
      </div>

      <div className="toolbar" role="group" aria-label={`Do something for ${kid.display_name}`}>
        <Link to={`/dashboard/tasks?child=${kid.id}&new=1`} className="btn secondary small">
          <Icon name="plus" size={14} /> Give a task
        </Link>
        <button type="button" className="btn secondary small" onClick={() => setModal('points')}>
          <Icon name="coins" size={14} /> Add or take points
        </button>
        <button type="button" className="btn secondary small" onClick={() => setModal('badge')}>
          <Icon name="medal" size={14} /> Give a badge
        </button>
        <button type="button" className="btn secondary small" onClick={() => setModal('export')}>
          <Icon name="log" size={14} /> Export
        </button>
      </div>

      <div className="grid-stats">
        <StatCard value={kid.points_balance} label="Points to spend" tone="mint" icon="coins" />
        <StatCard value={stats ? stats.approved : '–'} label="Tasks approved" tone="sky" icon="check" />
        <StatCard value={badges.data ? `${badges.data.streak.current} days` : '–'} label="Streak" tone="butter" icon="sparkle" />
        <StatCard value={badges.data ? `${earned.length} / ${allBadges.length}` : '–'} label="Badges" tone="lilac" icon="medal" />
      </div>
      {summary.data && stats && (
        <p className="small-text text-2 stats-note">
          {formatNumber(summary.data.earned_total)} points earned, {formatNumber(summary.data.spent_total)} spent or
          taken away · best streak {stats.best_streak} {stats.best_streak === 1 ? 'day' : 'days'}
        </p>
      )}

      <div className="widget-grid">
        <section className="card pad widget span-8" aria-labelledby="todo-title">
          <div className="section-top">
            <div>
              <h2 id="todo-title" className="section-title">To do</h2>
              <p className="section-sub">{tasks.length - waiting} open{waiting ? ` · ${waiting} waiting for you` : ''}</p>
            </div>
            {waiting > 0 && <Link to="/dashboard" className="text-link">Review <Icon name="arrowRight" size={13} /></Link>}
          </div>
          {todo.loading && !todo.data ? <LoadingState rows={2} label="Loading tasks" /> : tasks.length === 0 ? (
            <p className="caption widget-body">Nothing open right now.</p>
          ) : (
            <div className="widget-body limit" tabIndex={0} aria-label={`${kid.display_name}'s open tasks`}>
              {tasks.map((t) => {
                const due = dueInfo(t.due_date)
                return (
                  <div key={t.id} className="task-row">
                    <CategoryTile category={cats.of(t.category)} />
                    <div className="task-text">
                      <div className="task-title">{t.title}</div>
                      <div className="task-detail">
                        {formatNumber(t.points)} pts
                        {t.routine ? ` · ${describeWeekdays(t.routine.weekdays)}` : due ? ` · ${due.label}` : ''}
                      </div>
                    </div>
                    {t.status === 'submitted' && <span className="pill pill-warning">Waiting for you</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="card pad widget span-4" aria-labelledby="badges-title">
          <div className="section-top">
            <div>
              <h2 id="badges-title" className="section-title">Badges</h2>
              <p className="section-sub">{earned.length} earned</p>
            </div>
            <Link to="/dashboard/badges" className="text-link">Manage <Icon name="arrowRight" size={13} /></Link>
          </div>
          {earned.length === 0 ? (
            <p className="caption widget-body">None yet.</p>
          ) : (
            <ul className="list-plain widget-body limit" tabIndex={0} aria-label={`${kid.display_name}'s badges`}>
              {earned.map((b) => (
                <li key={b.id} className="list-row">
                  <div className={`task-icon ${b.tone}`} aria-hidden="true"><Icon name={b.icon} size={16} /></div>
                  <span className="flex-grow-1 fw-600 small-text">{b.title}</span>
                  <span className="tiny-text text-3">{shortDate(b.earned_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="widget-grid">
        <section className="card pad widget span-8" aria-labelledby="history-title">
          <div className="section-top">
            <div>
              <h2 id="history-title" className="section-title">Points history</h2>
              <p className="section-sub">Every change, and why</p>
            </div>
          </div>
          <PointsHistory childId={kid.id} version={changes} perPage={8}
            empty={`${kid.display_name} gets points when you approve a task, or when you add some here.`} />
        </section>

        <section className="card pad widget span-4" aria-labelledby="reviewed-title">
          <div className="section-top">
            <div>
              <h2 id="reviewed-title" className="section-title">Recently reviewed</h2>
              <p className="section-sub">What you approved or sent back</p>
            </div>
          </div>
          {reviewed.length === 0 ? <p className="caption widget-body">Nothing reviewed yet.</p> : (
            <ul className="list-plain widget-body limit" tabIndex={0} aria-label="Recently reviewed">
              {reviewed.map((s) => (
                <li key={s.id} className="list-row flex-wrap">
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-600 small-text">{s.task?.title}</div>
                    <div className="tiny-text text-3">
                      {s.status === 'approved' ? `Approved · +${formatNumber(s.points_awarded)} pts` : 'Sent back'}
                      {s.reviewed_at ? ` · ${shortDate(s.reviewed_at)}` : ''}
                      {s.review_note ? ` · “${s.review_note}”` : ''}
                    </div>
                    {s.has_photo && <SubmissionPhoto submission={s} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AdjustPointsModal open={modal === 'points'} child={kid} onClose={close}
        onDone={(result) => {
          toast.success(`Saved. ${kid.display_name} now has ${formatNumber(result.balance)} points.`)
          changed()
        }} />
      <GiveKidBadgeModal open={modal === 'badge'} kid={kid} badges={toGive} onClose={close} onGiven={changed} />
      <ExportModal open={modal === 'export'} child={kid} onClose={close} />
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
        This deletes {kid.display_name}'s account and everything about them: tasks, points, rewards, badges and photos.
        It can't be undone. Want a copy first? Cancel and use Export.
      </PasswordConfirmModal>
    </>
  )
}

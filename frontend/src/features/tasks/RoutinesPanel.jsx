import { useState } from 'react'
import { routinesApi } from '../../api/routines'
import { Avatar } from '../../components/ui/Avatar'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { PointsPill } from '../../components/ui/Pills'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { getErrorMessage } from '../../utils/errors'
import { useCategories } from '../categories/useCategories'
import { describeWeekdays } from './weekdays'

/** A parent's routines: tasks that come back on chosen days. `routines` is a useApi result. */
export default function RoutinesPanel({ routines, onCreate, onEdit, onChanged }) {
  const cats = useCategories()
  const toast = useToast()
  const [deleting, setDeleting] = useState(null)
  const [toggling, setToggling] = useState(null)
  const items = routines.data?.items || []

  async function togglePause(routine) {
    if (toggling) return
    setToggling(routine.id)
    const paused = routine.status === 'paused'
    try {
      await routinesApi.update(routine.id, { status: paused ? 'active' : 'paused' })
      toast.success(paused ? `“${routine.title}” resumed.` : `“${routine.title}” paused.`)
      onChanged()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setToggling(null)
    }
  }

  if (routines.loading && !routines.data) return <LoadingState rows={3} label="Loading routines" />
  if (routines.error) return <ErrorState error={routines.error} onRetry={routines.reload} />
  if (items.length === 0) {
    return (
      <div className="card-soft">
        <EmptyState title="No routines yet"
          message="A routine is a task that comes back on the days you pick, like brushing teeth or feeding the cat."
          action={<button type="button" className="btn secondary small" onClick={onCreate}>Create a routine</button>} />
      </div>
    )
  }

  return (
    <>
      <div className="grid-cards">
        {items.map((routine) => {
          const category = cats.of(routine.category)
          const paused = routine.status === 'paused'
          return (
            <article key={routine.id} className={`card-soft routine-card${paused ? ' is-paused' : ''}`}
              aria-label={routine.title}>
              <div className="d-flex justify-content-between gap-2 align-items-baseline">
                <h2 className="task-title">{routine.title}</h2>
                <PointsPill value={routine.points} />
              </div>
              <div className="task-meta">
                <span>{describeWeekdays(routine.weekdays)}</span>
                <span>{category.label}</span>
                <span className="d-inline-flex align-items-center gap-1">
                  <Avatar emoji={routine.assigned_to?.avatar} size="sm" />
                  {routine.assigned_to?.display_name}
                </span>
                {paused && <span className="pill pill-muted">Paused</span>}
              </div>
              <div className="d-flex gap-2 flex-wrap mt-auto">
                <button type="button" className="btn secondary small" onClick={() => onEdit(routine)}
                  aria-label={`Edit ${routine.title}`}>Edit</button>
                <button type="button" className="btn secondary small" onClick={() => togglePause(routine)}
                  disabled={toggling === routine.id} aria-label={`${paused ? 'Resume' : 'Pause'} ${routine.title}`}>
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button type="button" className="btn secondary small" onClick={() => setDeleting(routine)}
                  aria-label={`Delete ${routine.title}`}>Delete</button>
              </div>
            </article>
          )
        })}
      </div>

      <ConfirmDialog open={Boolean(deleting)} title={`Delete “${deleting?.title}”?`}
        message="It won't come back, and today's unfinished copy is put away. Past tasks and points are kept. For a holiday, pausing might be better."
        confirmLabel="Delete routine" tone="danger"
        onConfirm={async () => {
          await routinesApi.remove(deleting.id)
          toast.success('Routine deleted.')
          onChanged()
        }}
        onClose={() => setDeleting(null)} />
    </>
  )
}

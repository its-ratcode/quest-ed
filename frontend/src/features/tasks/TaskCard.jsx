import { Avatar } from '../../components/ui/Avatar'
import { CategoryTile } from '../../components/ui/LookPicker'
import { PointsPill, StatusPill } from '../../components/ui/Pills'
import { dueInfo } from '../../utils/format'
import { useCategories } from '../categories/useCategories'
import { TASK_STATUS } from './taskStatus'

/**
 * One task in a `.task-list`: its category tile, title, status, due date, kid, points and
 * actions. Kids press "I did it"; a parent's note shows after sending back or approving.
 */
export default function TaskCard({ task, viewerRole, onSubmit, onEdit, onArchive }) {
  const category = useCategories().of(task.category)
  const due = task.status === 'open' || task.status === 'submitted' ? dueInfo(task.due_date) : null
  const isParent = viewerRole === 'parent'
  const editable = task.status === 'open' || task.status === 'submitted'
  const latest = task.latest_submission
  const sentBack = task.status === 'open' && latest?.status === 'rejected'

  return (
    <article className={`task-card${task.status === 'approved' ? ' is-done' : ''}`} aria-label={task.title}>
      <CategoryTile category={category} />
      <div className="task-body">
        <h2 className="task-title">{task.title}</h2>
        {task.description && <p className="text-2 small-text mt-1">{task.description}</p>}
        <div className="task-meta">
          <StatusPill status={task.status} map={TASK_STATUS} />
          {due && <span className={`pill pill-${due.tone}`}>{due.label}</span>}
          <span>{category.label}</span>
          {isParent && task.assigned_to && (
            <span className="d-inline-flex align-items-center gap-1 sep">
              <Avatar emoji={task.assigned_to.avatar} size="sm" />
              {task.assigned_to.display_name}
            </span>
          )}
        </div>

        {sentBack && latest.review_note && <div className="review-note">Sent back: {latest.review_note}</div>}
        {task.status === 'approved' && latest?.review_note && (
          <div className="review-note ok">{latest.reviewed_by?.display_name || 'Parent'}: {latest.review_note}</div>
        )}
      </div>

      <div className="task-side">
        <PointsPill value={task.points} />
        {isParent && task.status !== 'archived' && (
          <div className="task-actions">
            {editable && (
              <button type="button" className="btn secondary small" onClick={() => onEdit(task)}
                aria-label={`Edit ${task.title}`}>Edit</button>
            )}
            {task.status !== 'submitted' && (
              <button type="button" className="btn secondary small" onClick={() => onArchive(task)}
                aria-label={`Archive ${task.title}`}>Archive</button>
            )}
          </div>
        )}
        {!isParent && task.status === 'open' && (
          <div className="task-actions">
            <button type="button" className="btn primary small" onClick={() => onSubmit(task)}
              aria-label={`I did it: ${task.title}`}>I did it</button>
          </div>
        )}
        {!isParent && task.status === 'submitted' && (
          <span className="small-text text-2">Sent. A parent will check it.</span>
        )}
      </div>
    </article>
  )
}

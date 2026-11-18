import { Avatar } from '../../components/ui/Avatar'
import { CategoryTile } from '../../components/ui/LookPicker'
import { PointsPill, StatusPill } from '../../components/ui/Pills'
import { dueInfo } from '../../utils/format'
import { useCategories } from '../categories/useCategories'
import { TASK_STATUS } from './taskStatus'

/** One task in a `.task-list`: its category tile, title, status, due date, kid, points and actions. */
export default function TaskCard({ task, viewerRole, onEdit, onArchive }) {
  const category = useCategories().of(task.category)
  const due = task.status === 'open' || task.status === 'submitted' ? dueInfo(task.due_date) : null
  const isParent = viewerRole === 'parent'
  const editable = task.status === 'open' || task.status === 'submitted'

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
      </div>
    </article>
  )
}

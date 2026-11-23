import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { tasksApi } from '../../api/tasks'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pager from '../../components/ui/Pager'
import SearchBox from '../../components/ui/SearchBox'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import SubmitTaskModal from './SubmitTaskModal'
import TaskCard from './TaskCard'

const PARENT_FILTERS = [['active', 'Active'], ['open', 'To do'], ['submitted', 'Waiting'], ['approved', 'Approved'],
  ['expired', 'Day ended'], ['archived', 'Archived']]
const CHILD_FILTERS = [['active', 'All'], ['open', 'To do'], ['submitted', 'Waiting'], ['approved', 'Done']]
const PER_PAGE = 20

/**
 * The task list with its filters. Status, kid, search and page live in the address
 * (?status=open&child=3&q=bed&page=2), so a filtered list can be bookmarked or shared.
 * `version` reloads it after a change made elsewhere (the task form lives on the page).
 */
export default function TaskList({ isParent, kids, version = 0, onCreate, onEdit }) {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || 'active'
  const childId = params.get('child') || ''
  const query = params.get('q') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [archiving, setArchiving] = useState(null)
  const [submitting, setSubmitting] = useState(null)

  const tasks = useApi((signal) => tasksApi.list({
    status, page, per_page: PER_PAGE, ...(childId ? { child_id: childId } : {}), ...(query ? { q: query } : {}),
  }, signal), [status, childId, page, query, version])

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value && !(key === 'status' && value === 'active')) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page') // a new filter starts again at page 1
    setParams(next, { replace: true })
  }

  const filters = isParent ? PARENT_FILTERS : CHILD_FILTERS
  const items = tasks.data?.items || []

  return (
    <>
      {(!isParent || kids.length > 0) && (
        <div className="filter-bar">
          <div className="tabs" role="tablist" aria-label="Filter tasks by status">
            {filters.map(([value, label]) => (
              <button key={value} type="button" role="tab" className="tab" aria-selected={status === value}
                onClick={() => setParam('status', value)}>
                {label}
              </button>
            ))}
          </div>
          {isParent && kids.length > 1 && (
            <select className="form-select" aria-label="Filter by child" value={childId}
              onChange={(e) => setParam('child', e.target.value)}>
              <option value="">All children</option>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.avatar} {k.display_name}</option>)}
            </select>
          )}
          <SearchBox value={query} delay={300}
            onChange={(v) => setParam('q', v.trim())} label="Search tasks" placeholder="Search tasks" />
        </div>
      )}

      {tasks.loading && !tasks.data ? (
        <LoadingState rows={4} label="Loading tasks" />
      ) : tasks.error ? (
        <ErrorState error={tasks.error} onRetry={tasks.reload} />
      ) : items.length === 0 && query ? (
        <div className="card-soft">
          <EmptyState title={`No tasks match “${query}”`} message="Try another word, or a different filter."
            action={<button type="button" className="btn secondary small" onClick={() => setParam('q', '')}>Clear search</button>} />
        </div>
      ) : items.length === 0 ? (
        <div className="card-soft">
          {isParent && kids.length === 0 ? (
            <EmptyState title="Add a child first" message="Tasks are for your kids. Add a child's account to get started."
              action={<Link to="/dashboard/family" className="btn primary">Add a child</Link>} />
          ) : (
            <EmptyState title={isParent ? 'No tasks here' : 'Nothing to do right now'}
              message={!isParent
                ? 'New tasks from your parents will show up here.'
                : status === 'expired'
                  ? "Routine tasks that weren't done on their day end up here. It's just a record."
                  : 'Tasks you give your kids will show up here.'}
              action={isParent && status === 'active' && (
                <button type="button" className="btn secondary small" onClick={onCreate}>Create a task</button>
              )} />
          )}
        </div>
      ) : (
        <>
          <div className="task-list">
            {items.map((task) => (
              <TaskCard key={task.id} task={task} viewerRole={isParent ? 'parent' : 'child'}
                onSubmit={setSubmitting} onEdit={onEdit} onArchive={setArchiving} />
            ))}
          </div>
          <Pager page={page} perPage={PER_PAGE} total={tasks.data?.total ?? items.length} label="Task pages"
            onChange={(p) => setParam('page', p > 1 ? String(p) : '')} />
        </>
      )}

      <SubmitTaskModal task={submitting} onClose={() => setSubmitting(null)}
        onSubmitted={() => {
          toast.success('Sent to your parent.')
          tasks.reload()
        }} />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={`Archive “${archiving?.title}”?`}
        message={archiving?.routine
          ? 'Only this copy is put away. The routine keeps going: to stop it, pause or delete it under Routines.'
          : "It leaves the kid's list. Its history, and any points already earned, are kept."}
        confirmLabel="Archive"
        onClose={() => setArchiving(null)}
        onConfirm={async () => {
          await tasksApi.archive(archiving.id)
          toast.success('Task archived.')
          tasks.reload()
        }}
      />
    </>
  )
}

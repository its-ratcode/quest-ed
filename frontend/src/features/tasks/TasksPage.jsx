import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { routinesApi } from '../../api/routines'
import { useAuth } from '../../auth/useAuth'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import CategoriesPanel from '../categories/CategoriesPanel'
import { useKids } from '../family/useKids'
import RoutinesPanel from './RoutinesPanel'
import TaskFormModal from './TaskFormModal'
import TaskList from './TaskList'

const VIEWS = [['tasks', 'Tasks'], ['routines', 'Routines'], ['categories', 'Categories']]
const CLOSED = { open: false, task: null, routine: null, repeat: false }

/** Tasks, and for parents the routines that repeat them and the categories that group them. */
export default function TasksPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isParent = user.role === 'parent'
  const [params, setParams] = useSearchParams()
  const asked = params.get('view')
  const view = isParent && (asked === 'routines' || asked === 'categories') ? asked : 'tasks'
  const { kids } = useKids(isParent)
  const [form, setForm] = useState(CLOSED)
  const [tasksVersion, setTasksVersion] = useState(0) // reloads the task list after a change elsewhere
  const routines = useApi((signal) => (isParent ? routinesApi.list({}, signal) : Promise.resolve(null)), [isParent])
  const routineCount = routines.data?.items?.length || 0

  const openNew = () => setForm({ ...CLOSED, open: true, repeat: view === 'routines' })
  const routinesChanged = () => {
    routines.reload()
    setTasksVersion((v) => v + 1) // today's copies may have changed too
  }
  const childId = params.get('child')

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{isParent ? 'Tasks' : 'My tasks'}</h1>
          <p>
            {view === 'categories'
              ? 'How tasks are grouped. Rename, recolour or add your own.'
              : view === 'routines'
                ? 'Tasks that come back on the days you pick.'
                : isParent ? "Everything you've asked your kids to do." : 'What a parent has asked you to do.'}
          </p>
        </div>
        {isParent && view !== 'categories' && kids.length > 0 && (
          <button type="button" className="btn primary" onClick={openNew}>
            {view === 'routines' ? '+ New routine' : '+ New task'}
          </button>
        )}
      </div>

      {isParent && (
        <div className="tabs mb-3" role="tablist" aria-label="Tasks, routines or categories">
          {VIEWS.map(([value, label]) => (
            <button key={value} type="button" role="tab" className="tab" aria-selected={view === value}
              onClick={() => setParams(value === 'tasks' ? {} : { view: value }, { replace: true })}>
              {label}{value === 'routines' && routineCount > 0 ? ` (${routineCount})` : ''}
            </button>
          ))}
        </div>
      )}

      {view === 'categories' ? (
        <CategoriesPanel />
      ) : view === 'routines' ? (
        <RoutinesPanel routines={routines} onCreate={openNew} onChanged={routinesChanged}
          onEdit={(routine) => setForm({ ...CLOSED, open: true, routine })} />
      ) : (
        <TaskList isParent={isParent} kids={kids} version={tasksVersion} onCreate={openNew}
          onEdit={(task) => setForm({ ...CLOSED, open: true, task })} />
      )}

      {isParent && (
        <TaskFormModal open={form.open} task={form.task} routine={form.routine} repeat={form.repeat} kids={kids}
          defaultChildId={childId ? Number(childId) : undefined} onClose={() => setForm(CLOSED)}
          onSaved={(kind, _item, edited, count) => {
            const forKids = count > 1 ? ` for ${count} kids` : ''
            if (kind === 'routine') {
              toast.success(edited ? 'Routine saved.' : `Routine created${forKids}.`)
              routinesChanged()
            } else {
              toast.success(edited ? 'Task updated.' : `Task created${forKids}.`)
              setTasksVersion((v) => v + 1)
            }
          }} />
      )}
    </>
  )
}

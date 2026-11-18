import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import CategoriesPanel from '../categories/CategoriesPanel'
import { useKids } from '../family/useKids'
import TaskList from './TaskList'

/** Tasks, and for parents the categories that group them. */
export default function TasksPage() {
  const { user } = useAuth()
  const isParent = user.role === 'parent'
  const [params, setParams] = useSearchParams()
  const view = isParent && params.get('view') === 'categories' ? 'categories' : 'tasks'
  const { kids } = useKids(isParent)
  const [form, setForm] = useState({ open: false, task: null })

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{isParent ? 'Tasks' : 'My tasks'}</h1>
          <p>
            {view === 'categories'
              ? 'How tasks are grouped. Rename, recolour or add your own.'
              : isParent ? "Everything you've asked your kids to do." : 'What a parent has asked you to do.'}
          </p>
        </div>
        {isParent && view === 'tasks' && kids.length > 0 && (
          <button type="button" className="btn primary" onClick={() => setForm({ open: true, task: null })}>
            + New task
          </button>
        )}
      </div>

      {isParent && (
        <div className="tabs mb-3" role="tablist" aria-label="Tasks or categories">
          <button type="button" role="tab" className="tab" aria-selected={view === 'tasks'}
            onClick={() => setParams({}, { replace: true })}>
            Tasks
          </button>
          <button type="button" role="tab" className="tab" aria-selected={view === 'categories'}
            onClick={() => setParams({ view: 'categories' }, { replace: true })}>
            Categories
          </button>
        </div>
      )}

      {view === 'categories'
        ? <CategoriesPanel />
        : <TaskList isParent={isParent} kids={kids} form={form} setForm={setForm} />}
    </>
  )
}

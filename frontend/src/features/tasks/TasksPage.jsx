import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { EmptyState } from '../../components/ui/States'
import CategoriesPanel from '../categories/CategoriesPanel'

/** Tasks, and for parents the categories that group them. The task list arrives in the next steps. */
export default function TasksPage() {
  const { user } = useAuth()
  const isParent = user.role === 'parent'
  const [params, setParams] = useSearchParams()
  const view = isParent && params.get('view') === 'categories' ? 'categories' : 'tasks'

  function show(next) {
    setParams(next === 'tasks' ? {} : { view: next }, { replace: true })
  }

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
      </div>

      {isParent && (
        <div className="tabs mb-3" role="tablist" aria-label="Tasks or categories">
          <button type="button" role="tab" className="tab" aria-selected={view === 'tasks'} onClick={() => show('tasks')}>
            Tasks
          </button>
          <button type="button" role="tab" className="tab" aria-selected={view === 'categories'}
            onClick={() => show('categories')}>
            Categories
          </button>
        </div>
      )}

      {view === 'categories' ? (
        <CategoriesPanel />
      ) : (
        <div className="card-soft">
          <EmptyState title="No tasks yet"
            message={isParent ? 'Tasks you give your kids will show up here.' : 'Tasks from your parents will show up here.'} />
        </div>
      )}
    </>
  )
}

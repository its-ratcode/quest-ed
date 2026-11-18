import { useState } from 'react'
import { categoriesApi } from '../../api/categories'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Icon from '../../components/ui/Icon'
import { CategoryTile } from '../../components/ui/LookPicker'
import { useToast } from '../../components/ui/toast/useToast'
import { getErrorMessage } from '../../utils/errors'
import CategoryFormModal from './CategoryFormModal'
import { useCategories } from './useCategories'

function usedText(used) {
  if (!used) return 'Not used yet'
  return used === 1 ? 'Used once' : `Used ${used} times`
}

/** Parents' list of task categories: add, rename, restyle, reorder, hide and remove. */
export default function CategoriesPanel() {
  const cats = useCategories()
  const toast = useToast()
  const [editing, setEditing] = useState({ open: false, category: null })
  const [removing, setRemoving] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const items = cats.items
  const activeCount = cats.active.length

  async function run(id, action, success) {
    setBusyId(id)
    try {
      await action()
      await cats.reload()
      if (success) toast.success(success)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  function move(index, delta) {
    const ids = items.map((c) => c.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + delta, 0, moved)
    run(moved, () => categoriesApi.reorder(ids))
  }

  return (
    <section className="card pad" aria-labelledby="cats-title">
      <div className="section-top">
        <div>
          <h2 id="cats-title" className="section-title">Categories</h2>
          <p className="section-sub">Group tasks your way. Kids see the name and picture on every task.</p>
        </div>
        <button type="button" className="btn primary small" onClick={() => setEditing({ open: true, category: null })}>
          <Icon name="plus" size={14} /> New category
        </button>
      </div>

      <ul className="list-plain">
        {items.map((c, i) => (
          <li key={c.id} className={`list-row cat-row${c.is_active ? '' : ' is-hidden'}`}>
            <CategoryTile category={c} />
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <div className="fw-600 one-line">{c.label}</div>
              <div className="small-text text-2">
                {usedText(c.used)}{!c.is_active && ' · hidden from new tasks'}
              </div>
            </div>
            <div className="cat-actions">
              <button type="button" className="icon-btn sm" aria-label={`Move ${c.label} up`}
                disabled={i === 0 || busyId !== null} onClick={() => move(i, -1)}>
                <Icon name="arrowUp" size={15} />
              </button>
              <button type="button" className="icon-btn sm" aria-label={`Move ${c.label} down`}
                disabled={i === items.length - 1 || busyId !== null} onClick={() => move(i, 1)}>
                <Icon name="arrowDown" size={15} />
              </button>
              <button type="button" className="icon-btn sm" aria-label={`Edit ${c.label}`}
                onClick={() => setEditing({ open: true, category: c })}>
                <Icon name="edit" size={15} />
              </button>
              <button type="button" className="icon-btn sm" title={c.is_active ? 'Hide from new tasks' : 'Show again'}
                aria-label={c.is_active ? `Hide ${c.label}` : `Show ${c.label}`}
                disabled={busyId === c.id || (c.is_active && activeCount <= 1)}
                onClick={() => run(c.id, () => categoriesApi.update(c.id, { is_active: !c.is_active }),
                  c.is_active ? `“${c.label}” is hidden from new tasks.` : `“${c.label}” is back.`)}>
                <Icon name={c.is_active ? 'eyeOff' : 'eye'} size={15} />
              </button>
              <button type="button" className="icon-btn sm danger" aria-label={`Remove ${c.label}`}
                disabled={c.is_active && activeCount <= 1} onClick={() => setRemoving(c)}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <CategoryFormModal
        open={editing.open}
        category={editing.category}
        onClose={() => setEditing({ open: false, category: null })}
        onSaved={async (edited) => {
          await cats.reload()
          toast.success(edited ? 'Category saved.' : 'Category added.')
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove “${removing?.label}”?`}
        message={removing?.used
          ? 'Some tasks use it, so it will be hidden instead: they keep the name, and it disappears from new tasks.'
          : 'Nothing uses it, so it will be removed for good.'}
        confirmLabel={removing?.used ? 'Hide it' : 'Remove'}
        tone="danger"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const res = await categoriesApi.remove(removing.id)
          await cats.reload()
          toast.success(res.removed ? 'Category removed.' : 'Category hidden. Old tasks keep it.')
        }}
      />
    </section>
  )
}

import { useState } from 'react'
import { categoriesApi } from '../../api/categories'
import Icon from '../../components/ui/Icon'
import { CategoryTile, PicturePicker, TonePicker } from '../../components/ui/LookPicker'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { useCategories } from './useCategories'

const EMPTY_DRAFT = { label: '', icon: 'star', tone: 'mint' }

/**
 * Choose a task's category: one tile per category the family uses, plus "New category"
 * to add one right here without leaving the form.
 */
export default function CategoryPicker({ id, value, onChange, error }) {
  const cats = useCategories()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [draftError, setDraftError] = useState(null)
  const [busy, setBusy] = useState(false)

  // A task already in a hidden category keeps showing it, so the choice isn't lost.
  const choices = !value || cats.active.some((c) => c.key === value) ? cats.active : [...cats.active, cats.of(value)]

  async function add() {
    if (busy) return
    if (!draft.label.trim()) {
      setDraftError('Give it a name.')
      return
    }
    setBusy(true)
    setDraftError(null)
    try {
      const { category } = await categoriesApi.create({ ...draft, label: draft.label.trim() })
      await cats.reload()
      onChange(category.key)
      setAdding(false)
      setDraft(EMPTY_DRAFT)
    } catch (err) {
      setDraftError(getFieldErrors(err).label || getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3">
      <span className="form-label d-block" id={`${id}-label`}>Category</span>
      <div className="cat-pick" role="radiogroup" aria-labelledby={`${id}-label`}>
        {choices.map((c) => (
          <button key={c.key} type="button" role="radio" className="cat-option" aria-checked={value === c.key}
            onClick={() => onChange(c.key)}>
            <CategoryTile category={c} size="sm" />
            <span className="one-line">{c.label}</span>
          </button>
        ))}
        {!adding && (
          <button type="button" className="cat-option cat-new" onClick={() => setAdding(true)}>
            <span className="task-icon sm" aria-hidden="true"><Icon name="plus" size={15} /></span>
            New category
          </button>
        )}
      </div>
      {error && <div className="invalid-feedback d-block">{error}</div>}

      {adding && (
        <div className="cat-draft" role="group" aria-label="New category">
          <div className="d-flex gap-2 align-items-center">
            <CategoryTile category={draft} />
            <input className={`form-control${draftError ? ' is-invalid' : ''}`} maxLength={30} value={draft.label}
              aria-label="New category name" placeholder="e.g. Music practice" autoFocus
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault() // add the category, not submit the whole task form
                  add()
                }
              }} />
          </div>
          {draftError && <div className="invalid-feedback d-block">{draftError}</div>}
          <span className="form-label d-block mt-3" id={`${id}-pic`}>Picture</span>
          <PicturePicker value={draft.icon} labelledBy={`${id}-pic`} onChange={(icon) => setDraft((d) => ({ ...d, icon }))} />
          <span className="form-label d-block mt-3" id={`${id}-tone`}>Colour</span>
          <TonePicker value={draft.tone} labelledBy={`${id}-tone`} onChange={(tone) => setDraft((d) => ({ ...d, tone }))} />
          <div className="d-flex gap-2 justify-content-end mt-3">
            <button type="button" className="btn secondary small" disabled={busy}
              onClick={() => {
                setAdding(false)
                setDraftError(null)
              }}>
              Cancel
            </button>
            <button type="button" className="btn primary small" onClick={add} disabled={busy}>
              {busy ? 'Adding…' : 'Add category'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

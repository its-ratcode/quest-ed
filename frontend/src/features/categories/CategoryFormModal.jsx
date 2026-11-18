import { useState } from 'react'
import { categoriesApi } from '../../api/categories'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import { CategoryTile, PicturePicker, TonePicker } from '../../components/ui/LookPicker'
import Modal from '../../components/ui/Modal'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

/** Add a category, or edit one. Rendered only while open, so the form starts fresh. */
export default function CategoryFormModal({ open, ...props }) {
  if (!open) return null
  return <CategoryForm {...props} />
}

function CategoryForm({ category, onClose, onSaved }) {
  const [form, setForm] = useState(category
    ? { label: category.label, icon: category.icon, tone: category.tone }
    : { label: '', icon: 'star', tone: 'mint' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    if (!form.label.trim()) {
      setErrors({ label: 'Give it a name.' })
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const payload = { ...form, label: form.label.trim() }
      if (category) await categoriesApi.update(category.id, payload)
      else await categoriesApi.create(payload)
      await onSaved(Boolean(category))
      onClose()
    } catch (err) {
      setErrors(getFieldErrors(err))
      setFormError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={category ? 'Edit category' : 'New category'} onClose={onClose} busy={busy}
      description="Renaming a category renames it on every task that uses it.">
      <form onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}
        <div className="d-flex align-items-start gap-3">
          <span className="mt-4"><CategoryTile category={form} /></span>
          <div className="flex-grow-1">
            <Field id="cat-label" label="Name" error={errors.label}>
              <input {...fieldProps('cat-label', errors.label)} maxLength={30} value={form.label} data-autofocus
                placeholder="e.g. Music practice" onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </Field>
          </div>
        </div>
        <div className="mb-3">
          <span className="form-label d-block" id="cat-pic">Picture</span>
          <PicturePicker value={form.icon} labelledBy="cat-pic" onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
        </div>
        <div className="mb-3">
          <span className="form-label d-block" id="cat-tone">Colour</span>
          <TonePicker value={form.tone} labelledBy="cat-tone" onChange={(tone) => setForm((f) => ({ ...f, tone }))} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : category ? 'Save' : 'Add category'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

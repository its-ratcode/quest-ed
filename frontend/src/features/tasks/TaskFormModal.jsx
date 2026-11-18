import { useState } from 'react'
import { tasksApi } from '../../api/tasks'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import Modal from '../../components/ui/Modal'
import SearchBox from '../../components/ui/SearchBox'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { matches } from '../../utils/search'
import CategoryPicker from '../categories/CategoryPicker'
import { useCategories } from '../categories/useCategories'

const QUICK_POINTS = [5, 10, 20, 50]

/**
 * Give a new task to one kid or several (one copy each), or edit a task.
 * onSaved(task, edited, count). Rendered only while open, so the form starts fresh.
 */
export default function TaskFormModal({ open, ...props }) {
  if (!open) return null
  return <TaskForm {...props} />
}

function TaskForm({ task, kids, defaultChildId, onClose, onSaved }) {
  const editing = Boolean(task)
  const firstCategory = useCategories().active[0]?.key || 'chores'
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    category: task?.category || firstCategory,
    points: task?.points ?? 10,
    due_date: task?.due_date || '',
    assigned_to_id: task?.assigned_to?.id ?? '',
    assigned_to_ids: [Number(defaultChildId ?? kids[0]?.id)].filter(Boolean),
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [kidQuery, setKidQuery] = useState('')

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const toggleKid = (id) => setForm((f) => ({
    ...f,
    assigned_to_ids: f.assigned_to_ids.includes(id) ? f.assigned_to_ids.filter((k) => k !== id) : [...f.assigned_to_ids, id],
  }))
  const allChosen = form.assigned_to_ids.length === kids.length

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const local = {}
    if (!form.title.trim()) local.title = 'Give the task a title.'
    const points = Number(form.points)
    if (!Number.isInteger(points) || points < 1 || points > 1000) local.points = 'Use a whole number from 1 to 1000.'
    if (!editing && form.assigned_to_ids.length === 0) local.assigned_to_ids = 'Choose who this is for.'
    setErrors(local)
    if (Object.keys(local).length) return

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      points,
      due_date: form.due_date || null,
      ...(editing ? { assigned_to_id: Number(form.assigned_to_id) } : { assigned_to_ids: form.assigned_to_ids }),
    }
    setBusy(true)
    setFormError(null)
    try {
      const result = editing ? await tasksApi.update(task.id, payload) : await tasksApi.create(payload)
      onSaved(result.task, editing, result.tasks?.length || 1)
      onClose()
    } catch (error) {
      setErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error))
      setBusy(false)
    }
  }

  return (
    <Modal size="lg" open title={editing ? 'Edit task' : 'New task'} onClose={onClose} busy={busy}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}

        <Field id="task-title" label="What needs doing?" error={errors.title}>
          <input {...fieldProps('task-title', errors.title)} value={form.title} onChange={update('title')}
            maxLength={120} placeholder="e.g. Make your bed" data-autofocus />
        </Field>
        <Field id="task-description" label="Details (optional)" error={errors.description}>
          <textarea {...fieldProps('task-description', errors.description)} rows={2} maxLength={2000}
            value={form.description} onChange={update('description')} placeholder="What does “done” look like?" />
        </Field>

        {editing ? (
          <Field id="task-child" label="For" error={errors.assigned_to_id}>
            <select {...fieldProps('task-child', errors.assigned_to_id)} className="form-select"
              value={form.assigned_to_id} onChange={update('assigned_to_id')} disabled={task.status === 'submitted'}>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.avatar} {k.display_name}</option>)}
            </select>
          </Field>
        ) : (
          <fieldset className="mb-3">
            <div className="d-flex justify-content-between align-items-baseline">
              <legend className="form-label mb-1" style={{ float: 'none', width: 'auto', fontSize: 'inherit' }}>For</legend>
              {kids.length > 1 && (
                <button type="button" className="text-link small-text"
                  onClick={() => setForm((f) => ({ ...f, assigned_to_ids: allChosen ? [] : kids.map((k) => k.id) }))}>
                  {allChosen ? 'Clear' : 'Everyone'}
                </button>
              )}
            </div>
            {kids.length > 6 && (
              <div className="kid-pick-head">
                <SearchBox value={kidQuery} onChange={setKidQuery} label="Find a kid" placeholder="Find a kid" />
                <span className="small-text text-2" aria-live="polite">{form.assigned_to_ids.length} of {kids.length} chosen</span>
              </div>
            )}
            <div className="kid-pick" role="group" aria-label="Choose one or more kids">
              {kids.filter((k) => matches(k.display_name, kidQuery)).map((k) => (
                <button key={k.id} type="button" className="kid-chip" aria-pressed={form.assigned_to_ids.includes(k.id)}
                  onClick={() => toggleKid(k.id)}>
                  <span aria-hidden="true">{k.avatar}</span> {k.display_name}
                </button>
              ))}
            </div>
            {errors.assigned_to_ids
              ? <div className="invalid-feedback d-block">{errors.assigned_to_ids}</div>
              : form.assigned_to_ids.length > 1 && (
                <div className="form-text">Each kid gets their own copy to tick off, and earns the points separately.</div>
              )}
          </fieldset>
        )}

        <CategoryPicker id="task-category" value={form.category} error={errors.category}
          onChange={(category) => setForm((f) => ({ ...f, category }))} />

        <div className="row g-3">
          <div className="col-sm-6">
            <Field id="task-points" label="Points" error={errors.points}>
              <div className="points-input">
                <input {...fieldProps('task-points', errors.points)} type="number" min={1} max={1000}
                  inputMode="numeric" value={form.points} onChange={update('points')} />
                <div className="segmented" role="group" aria-label="Quick point values">
                  {QUICK_POINTS.map((p) => (
                    <button key={p} type="button" aria-pressed={Number(form.points) === p}
                      onClick={() => setForm((f) => ({ ...f, points: p }))}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </div>
          <div className="col-sm-6">
            <Field id="task-due" label="Due date (optional)" error={errors.due_date}>
              <input {...fieldProps('task-due', errors.due_date)} type="date" value={form.due_date}
                onChange={update('due_date')} />
            </Field>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

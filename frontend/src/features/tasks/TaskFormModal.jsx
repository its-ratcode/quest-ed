import { useState } from 'react'
import { routinesApi } from '../../api/routines'
import { tasksApi } from '../../api/tasks'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import Modal from '../../components/ui/Modal'
import SearchBox from '../../components/ui/SearchBox'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { matches } from '../../utils/search'
import CategoryPicker from '../categories/CategoryPicker'
import { useCategories } from '../categories/useCategories'
import WeekdayPicker from './WeekdayPicker'
import { EVERY_DAY } from './weekdays'

const QUICK_POINTS = [5, 10, 20, 50]
const HOW_OFTEN = [[false, 'Just once'], [true, 'Repeats']]

/**
 * Give a new task (once, or repeating on chosen days) to one kid or several (one copy each),
 * edit one task, or edit a routine. Rendered only while open, so the form starts fresh.
 * onSaved(kind: 'task' | 'routine', item, edited, count).
 */
export default function TaskFormModal({ open, ...props }) {
  if (!open) return null
  return <TaskForm {...props} />
}

function TaskForm({ task, routine, repeat: startRepeating = false, kids, defaultChildId, onClose, onSaved }) {
  const source = routine || task
  const creating = !source
  const firstCategory = useCategories().active[0]?.key || 'chores'
  const [form, setForm] = useState({
    title: source?.title || '',
    description: source?.description || '',
    category: source?.category || firstCategory,
    points: source?.points ?? (startRepeating ? 5 : 10),
    due_date: task?.due_date || '',
    assigned_to_id: source?.assigned_to?.id ?? '',
    assigned_to_ids: [Number(defaultChildId ?? kids[0]?.id)].filter(Boolean),
    repeat: Boolean(routine) || (creating && startRepeating),
    weekdays: routine?.weekdays || EVERY_DAY,
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [kidQuery, setKidQuery] = useState('')

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const update = (key) => (e) => set(key, e.target.value)
  const toggleKid = (id) => set('assigned_to_ids',
    form.assigned_to_ids.includes(id) ? form.assigned_to_ids.filter((k) => k !== id) : [...form.assigned_to_ids, id])
  const allChosen = form.assigned_to_ids.length === kids.length

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const local = {}
    if (!form.title.trim()) local.title = 'Give the task a title.'
    const points = Number(form.points)
    if (!Number.isInteger(points) || points < 1 || points > 1000) local.points = 'Use a whole number from 1 to 1000.'
    if (creating && form.assigned_to_ids.length === 0) local.assigned_to_ids = 'Choose who this is for.'
    if (form.repeat && form.weekdays.length === 0) local.weekdays = 'Pick at least one day.'
    setErrors(local)
    if (Object.keys(local).length) return

    const base = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      points,
      ...(creating ? { assigned_to_ids: form.assigned_to_ids } : { assigned_to_id: Number(form.assigned_to_id) }),
    }
    setBusy(true)
    setFormError(null)
    try {
      if (form.repeat) {
        const payload = { ...base, weekdays: form.weekdays }
        const result = routine ? await routinesApi.update(routine.id, payload) : await routinesApi.create(payload)
        onSaved('routine', result.routine, Boolean(routine), result.routines?.length || 1)
      } else {
        const payload = { ...base, due_date: form.due_date || null }
        const result = task ? await tasksApi.update(task.id, payload) : await tasksApi.create(payload)
        onSaved('task', result.task, Boolean(task), result.tasks?.length || 1)
      }
      onClose()
    } catch (error) {
      setErrors(getFieldErrors(error))
      setFormError(getErrorMessage(error))
      setBusy(false)
    }
  }

  const title = routine ? 'Edit routine' : task ? 'Edit task' : 'New task'
  const description = routine
    ? 'Changes start today. Anything already sent for checking keeps its points.'
    : task?.routine
      ? "This only changes today's copy. To change the other days, edit the routine."
      : null

  return (
    <Modal size="lg" open title={title} description={description} onClose={onClose} busy={busy}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}

        {creating && (
          <div className="tabs mb-3" role="radiogroup" aria-label="How often">
            {HOW_OFTEN.map(([value, label]) => (
              <button key={label} type="button" role="radio" className="tab" aria-checked={form.repeat === value}
                onClick={() => set('repeat', value)}>
                {label}
              </button>
            ))}
          </div>
        )}

        <Field id="task-title" label="What needs doing?" error={errors.title}>
          <input {...fieldProps('task-title', errors.title)} value={form.title} onChange={update('title')} maxLength={120}
            placeholder={form.repeat ? 'e.g. Brush teeth before bed' : 'e.g. Make your bed'} data-autofocus />
        </Field>
        <Field id="task-description" label="Details (optional)" error={errors.description}>
          <textarea {...fieldProps('task-description', errors.description)} rows={2} maxLength={2000}
            value={form.description} onChange={update('description')} placeholder="What does “done” look like?" />
        </Field>

        {form.repeat && (
          <div className="mb-3">
            <span className="form-label d-block" id="weekdays-label">On these days</span>
            <WeekdayPicker value={form.weekdays} labelledBy="weekdays-label" onChange={(days) => set('weekdays', days)} />
            {errors.weekdays
              ? <div className="invalid-feedback d-block">{errors.weekdays}</div>
              : <div className="form-text">It shows up on each of these days. If it isn't done, it drops off at the end of the day.</div>}
          </div>
        )}

        {creating ? (
          <fieldset className="mb-3">
            <div className="d-flex justify-content-between align-items-baseline">
              <legend className="form-label mb-1" style={{ float: 'none', width: 'auto', fontSize: 'inherit' }}>For</legend>
              {kids.length > 1 && (
                <button type="button" className="text-link small-text"
                  onClick={() => set('assigned_to_ids', allChosen ? [] : kids.map((k) => k.id))}>
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
        ) : (
          <Field id="task-child" label="For" error={errors.assigned_to_id}>
            <select {...fieldProps('task-child', errors.assigned_to_id)} className="form-select"
              value={form.assigned_to_id} onChange={update('assigned_to_id')} disabled={task?.status === 'submitted'}>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.avatar} {k.display_name}</option>)}
            </select>
          </Field>
        )}

        <CategoryPicker id="task-category" value={form.category} error={errors.category}
          onChange={(category) => set('category', category)} />

        <div className="row g-3">
          <div className="col-sm-6">
            <Field id="task-points" label={form.repeat ? 'Points each time' : 'Points'} error={errors.points}>
              <div className="points-input">
                <input {...fieldProps('task-points', errors.points)} type="number" min={1} max={1000}
                  inputMode="numeric" value={form.points} onChange={update('points')} />
                <div className="segmented" role="group" aria-label="Quick point values">
                  {QUICK_POINTS.map((p) => (
                    <button key={p} type="button" aria-pressed={Number(form.points) === p} onClick={() => set('points', p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </div>
          {!form.repeat && (
            <div className="col-sm-6">
              <Field id="task-due" label="Due date (optional)" error={errors.due_date}>
                <input {...fieldProps('task-due', errors.due_date)} type="date" value={form.due_date}
                  onChange={update('due_date')} />
              </Field>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : !creating ? 'Save changes' : form.repeat ? 'Create routine' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

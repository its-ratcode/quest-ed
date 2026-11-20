import { useState } from 'react'
import { pointsApi } from '../../api/points'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import Modal from '../../components/ui/Modal'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { formatNumber } from '../../utils/format'

const MAX = 10000
const DIRECTIONS = [['add', 'Add points'], ['remove', 'Take points away']]

/**
 * A parent adds points (a bonus) or takes some away (a correction) for one kid. The reason
 * shows in the kid's history. Rendered only while open, so it starts fresh each time.
 * onDone(result) with { transaction, balance }.
 */
export default function AdjustPointsModal({ open, ...props }) {
  if (!open) return null
  return <AdjustForm {...props} />
}

function AdjustForm({ child, onClose, onDone }) {
  const [form, setForm] = useState({ direction: 'add', amount: '10', reason: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const adding = form.direction === 'add'
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const amount = Number(form.amount)
    const local = {}
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX) local.amount = `Use a whole number from 1 to ${formatNumber(MAX)}.`
    else if (!adding && amount > child.points_balance) {
      local.amount = `${child.display_name} only has ${formatNumber(child.points_balance)} points.`
    }
    if (!form.reason.trim()) local.reason = 'Say why, so everyone can see where points come from.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) return

    setBusy(true)
    try {
      const result = await pointsApi.adjust({
        child_id: child.id, amount: adding ? amount : -amount, reason: form.reason.trim(),
      })
      onDone(result)
      onClose()
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Points for ${child.display_name}`} onClose={onClose} busy={busy}
      description={`${child.display_name} has ${formatNumber(child.points_balance)} points. The reason shows in their history.`}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}
        <div className="tabs mb-3" role="radiogroup" aria-label="Add or take away">
          {DIRECTIONS.map(([value, label]) => (
            <button key={value} type="button" role="radio" className="tab" aria-checked={form.direction === value}
              onClick={() => set('direction', value)}>
              {label}
            </button>
          ))}
        </div>
        <Field id="adjust-amount" label="Points" error={errors.amount}>
          <input {...fieldProps('adjust-amount', errors.amount)} type="number" min={1} max={MAX} inputMode="numeric"
            value={form.amount} onChange={(e) => set('amount', e.target.value)} data-autofocus />
        </Field>
        <Field id="adjust-reason" label="Reason" error={errors.reason}>
          <input {...fieldProps('adjust-reason', errors.reason)} maxLength={160} value={form.reason}
            placeholder={adding ? 'Helped a neighbour without being asked' : 'Fixing a double entry'}
            onChange={(e) => set('reason', e.target.value)} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : adding ? 'Add points' : 'Take points away'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

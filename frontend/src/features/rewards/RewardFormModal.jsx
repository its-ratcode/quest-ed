import { useState } from 'react'
import { rewardsApi } from '../../api/rewards'
import { AvatarPicker } from '../../components/ui/AvatarPicker'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import Modal from '../../components/ui/Modal'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { formatNumber } from '../../utils/format'
import { REWARD_EMOJIS } from './rewardOptions'

const MAX_COST = 100000
const MAX_STOCK = 10000

/**
 * A parent adds a reward, or changes one (`reward` set). Rendered only while open, so it
 * starts fresh each time. onSaved(reward, edited).
 */
export default function RewardFormModal({ open, ...props }) {
  if (!open) return null
  return <RewardForm {...props} />
}

function RewardForm({ reward, onClose, onSaved }) {
  const [form, setForm] = useState(() => (reward
    ? { title: reward.title, description: reward.description, emoji: reward.emoji, cost: String(reward.cost),
        limited: reward.stock !== null, stock: String(reward.stock ?? 1) }
    : { title: '', description: '', emoji: '🎁', cost: '50', limited: false, stock: '1' }))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const cost = Number(form.cost)
    const stock = Number(form.stock)
    const local = {}
    if (!form.title.trim()) local.title = 'Name the reward.'
    if (!Number.isInteger(cost) || cost < 1 || cost > MAX_COST) local.cost = `Use a whole number from 1 to ${formatNumber(MAX_COST)}.`
    if (form.limited && (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK)) {
      local.stock = `Use a whole number from 0 to ${formatNumber(MAX_STOCK)}.`
    }
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) return

    const payload = {
      title: form.title.trim(), description: form.description.trim(), emoji: form.emoji,
      cost, stock: form.limited ? stock : null,
    }
    setBusy(true)
    try {
      const result = reward ? await rewardsApi.update(reward.id, payload) : await rewardsApi.create(payload)
      onSaved(result.reward, Boolean(reward))
      onClose()
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal size="lg" open title={reward ? 'Edit reward' : 'New reward'} onClose={onClose} busy={busy}
      description="Rewards are things your kids can spend their points on.">
      <form onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}
        <Field id="reward-title" label="Reward" error={errors.title}>
          <input {...fieldProps('reward-title', errors.title)} maxLength={120} value={form.title}
            onChange={(e) => set('title', e.target.value)} placeholder="e.g. Pick the movie tonight" data-autofocus />
        </Field>
        <Field id="reward-description" label="Details (optional)" error={errors.description}>
          <textarea {...fieldProps('reward-description', errors.description)} rows={2} maxLength={1000}
            value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="mb-3">
          <span className="form-label d-block">Icon</span>
          <AvatarPicker value={form.emoji} options={REWARD_EMOJIS} label="Reward icon"
            onChange={(emoji) => set('emoji', emoji)} />
          {errors.emoji && <div className="invalid-feedback d-block">{errors.emoji}</div>}
        </div>
        <div className="row g-3">
          <div className="col-sm-6">
            <Field id="reward-cost" label="Cost in points" error={errors.cost}>
              <input {...fieldProps('reward-cost', errors.cost)} type="number" min={1} max={MAX_COST} inputMode="numeric"
                value={form.cost} onChange={(e) => set('cost', e.target.value)} />
            </Field>
          </div>
          <div className="col-sm-6">
            <div className="form-check mt-sm-4 mb-2">
              <input id="reward-limited" type="checkbox" className="form-check-input" checked={form.limited}
                onChange={(e) => set('limited', e.target.checked)} />
              <label htmlFor="reward-limited" className="form-check-label">Limited quantity</label>
            </div>
            {form.limited && (
              <Field id="reward-stock" label="How many available" error={errors.stock}>
                <input {...fieldProps('reward-stock', errors.stock)} type="number" min={0} max={MAX_STOCK} inputMode="numeric"
                  value={form.stock} onChange={(e) => set('stock', e.target.value)} />
              </Field>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : reward ? 'Save changes' : 'Add reward'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

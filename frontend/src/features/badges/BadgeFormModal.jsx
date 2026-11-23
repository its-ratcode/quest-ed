import { useState } from 'react'
import { badgesApi } from '../../api/badges'
import { rewardsApi } from '../../api/rewards'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import { PicturePicker, TonePicker } from '../../components/ui/LookPicker'
import Modal from '../../components/ui/Modal'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import CategoryPicker from '../categories/CategoryPicker'
import { useCategories } from '../categories/useCategories'
import BadgeEmblem from './BadgeEmblem'
import { BADGE_RULES } from './badgeRules'

const MAX_BONUS = 1000

/**
 * Make a badge or change one (`badge` set): its look, how it's earned, who can earn it and an
 * optional prize. Rendered only while open, so it starts fresh. onSaved(badge, edited).
 */
export default function BadgeFormModal({ open, ...props }) {
  if (!open) return null
  return <BadgeForm {...props} />
}

function BadgeForm({ badge, kids, onClose, onSaved }) {
  const firstCategory = useCategories().active[0]?.key || 'chores'
  const [form, setForm] = useState(() => ({
    title: badge?.title || '',
    description: badge?.description || '',
    icon: badge?.icon || 'star',
    tone: badge?.tone || 'mint',
    rule: badge?.rule || 'tasks',
    category: badge?.category || firstCategory,
    target: String(badge?.target ?? 10),
    child_id: badge?.child ? String(badge.child.id) : '',
    bonus_points: String(badge?.bonus_points ?? 0),
    bonus_reward_id: badge?.bonus_reward ? String(badge.bonus_reward.id) : '',
  }))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const shop = useApi((signal) => rewardsApi.list(signal), [])
  const rewards = (shop.data?.items || []).filter((r) => r.is_active)
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const update = (key) => (e) => set(key, e.target.value)
  const manual = form.rule === 'manual'

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const target = Number(form.target)
    const bonus = form.bonus_points === '' ? 0 : Number(form.bonus_points)
    const local = {}
    if (!form.title.trim()) local.title = 'Give the badge a name.'
    if (!manual && (!Number.isInteger(target) || target < 1 || target > 10000)) local.target = 'Use a whole number from 1 to 10,000.'
    if (!Number.isInteger(bonus) || bonus < 0 || bonus > MAX_BONUS) local.bonus_points = 'Use a whole number from 0 to 1,000.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length) return

    const payload = {
      title: form.title.trim(), description: form.description.trim(), icon: form.icon, tone: form.tone,
      rule: form.rule, child_id: form.child_id ? Number(form.child_id) : null,
      bonus_points: bonus, bonus_reward_id: form.bonus_reward_id ? Number(form.bonus_reward_id) : null,
      ...(manual ? {} : { target }),
      ...(form.rule === 'category_tasks' ? { category: form.category } : {}),
    }
    setBusy(true)
    try {
      const result = badge ? await badgesApi.update(badge.id, payload) : await badgesApi.create(payload)
      onSaved(result.badge, Boolean(badge))
      onClose()
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal size="lg" open title={badge ? 'Edit badge' : 'Make a badge'} onClose={onClose} busy={busy}
      description="Pick what it takes to earn it. Automatic badges are given out as soon as a kid gets there.">
      <form onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert-soft error mb-3" role="alert">{formError}</div>}

        <div className="row g-4">
          <section className="col-md-6" aria-labelledby="badge-look">
            <h3 id="badge-look" className="form-section-title">Look</h3>
            <div className="d-flex align-items-center gap-3 mb-3">
              <BadgeEmblem icon={form.icon} tone={form.tone} size={28} />
              <div className="flex-grow-1">
                <Field id="badge-title" label="Badge name" error={errors.title}>
                  <input {...fieldProps('badge-title', errors.title)} maxLength={60} value={form.title}
                    onChange={update('title')} placeholder="e.g. Bookworm" data-autofocus />
                </Field>
              </div>
            </div>
            <div className="mb-3">
              <span className="form-label d-block" id="badge-icon-label">Picture</span>
              <PicturePicker value={form.icon} labelledBy="badge-icon-label" onChange={(icon) => set('icon', icon)} />
            </div>
            <div className="mb-3">
              <span className="form-label d-block" id="badge-tone-label">Colour</span>
              <TonePicker value={form.tone} labelledBy="badge-tone-label" onChange={(tone) => set('tone', tone)} />
            </div>
            <Field id="badge-description" label="Message on the badge (optional)" error={errors.description}
              hint="Leave it empty and the goal is shown instead.">
              <input {...fieldProps('badge-description', errors.description, true)} maxLength={200}
                value={form.description} onChange={update('description')} placeholder="e.g. For loving books" />
            </Field>
          </section>

          <section className="col-md-6" aria-labelledby="badge-rules">
            <h3 id="badge-rules" className="form-section-title">How it's earned</h3>
            <Field id="badge-rule" label="Earned by" error={errors.rule}>
              <select {...fieldProps('badge-rule', errors.rule)} className="form-select" value={form.rule}
                onChange={update('rule')}>
                {Object.entries(BADGE_RULES).map(([value, rule]) => <option key={value} value={value}>{rule.label}</option>)}
              </select>
            </Field>
            {form.rule === 'category_tasks' && (
              <CategoryPicker id="badge-category" value={form.category} error={errors.category}
                onChange={(category) => set('category', category)} />
            )}
            {manual ? (
              <p className="small-text text-2 mb-3">You hand this one out yourself with “Give”, for moments that deserve it.</p>
            ) : (
              <Field id="badge-target" label={`Goal: how many ${BADGE_RULES[form.rule].unit}?`} error={errors.target}>
                <input {...fieldProps('badge-target', errors.target)} type="number" min={1} max={10000}
                  inputMode="numeric" value={form.target} onChange={update('target')} />
              </Field>
            )}
            <Field id="badge-child" label="Who can earn it?" error={errors.child_id}>
              <select {...fieldProps('badge-child', errors.child_id)} className="form-select" value={form.child_id}
                onChange={update('child_id')}>
                <option value="">Every kid</option>
                {kids.map((k) => <option key={k.id} value={k.id}>Only {k.display_name}</option>)}
              </select>
            </Field>
          </section>
        </div>

        <section className="form-section" aria-labelledby="badge-prize">
          <h3 id="badge-prize" className="form-section-title">Prize (optional)</h3>
          <p className="tiny-text text-3 mb-2">Given once, the moment a kid earns the badge.</p>
          <div className="row g-3">
            <div className="col-sm-5">
              <Field id="badge-bonus" label="Bonus points" error={errors.bonus_points} hint="0 for none.">
                <input {...fieldProps('badge-bonus', errors.bonus_points, true)} type="number" min={0} max={MAX_BONUS}
                  inputMode="numeric" value={form.bonus_points} onChange={update('bonus_points')} />
              </Field>
            </div>
            <div className="col-sm-7">
              <Field id="badge-reward" label="A free reward" error={errors.bonus_reward_id}
                hint="Shows up under “To hand over”, like a bought one.">
                <select {...fieldProps('badge-reward', errors.bonus_reward_id, true)} className="form-select"
                  value={form.bonus_reward_id} onChange={update('bonus_reward_id')}>
                  <option value="">No reward</option>
                  {rewards.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.title}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : badge ? 'Save changes' : 'Create badge'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

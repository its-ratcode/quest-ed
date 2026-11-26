import { useState } from 'react'
import { adminApi } from '../../api/admin'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { fieldProps } from '../../components/ui/fieldProps'
import Modal from '../../components/ui/Modal'
import { StatusPill } from '../../components/ui/Pills'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { formatDate } from '../../utils/format'

const AUDIENCE = { all: 'Everyone', parents: 'Parents', children: 'Kids' }
const STATUS = {
  showing: { label: 'Showing', tone: 'success' },
  ended: { label: 'Ended', tone: 'muted' },
  removed: { label: 'Taken down', tone: 'muted' },
}

function statusOf(notice, now = new Date()) {
  if (!notice.is_active) return 'removed'
  if (notice.expires_at && new Date(notice.expires_at) <= now) return 'ended'
  return 'showing'
}

/** Short messages shown at the top of everyone's pages, for example planned downtime. */
export default function AdminNoticesPage() {
  const toast = useToast()
  const notices = useApi((signal) => adminApi.notices(signal), [])
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const items = notices.data?.items || []

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Notices</h1>
          <p>A short message at the top of everyone&apos;s pages, for example planned downtime.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>+ Add notice</button>
      </div>

      {notices.loading && !notices.data ? (
        <LoadingState label="Loading notices" />
      ) : notices.error ? (
        <ErrorState error={notices.error} onRetry={notices.reload} />
      ) : items.length === 0 ? (
        <EmptyState title="No notices yet" />
      ) : (
        <section className="card-soft" aria-label="Notices">
          <ul className="list-plain">
            {items.map((n) => {
              const status = statusOf(n)
              return (
                <li key={n.id} className={`list-row notice-row${status === 'showing' ? '' : ' is-off'}`}>
                  <div className="flex-grow-1 min-w-0">
                    <div className="notice-text fw-600">{n.message}</div>
                    <div className="small-text text-3">
                      {AUDIENCE[n.audience]} · {n.level === 'warning' ? 'Important' : 'Info'} · posted {formatDate(n.created_at)}
                      {n.expires_at ? ` · until ${formatDate(n.expires_at)}` : ''}
                    </div>
                  </div>
                  <StatusPill status={status} map={STATUS} />
                  {status === 'showing' && (
                    <button type="button" className="btn secondary small" onClick={() => setRemoving(n)}
                      aria-label={`Take down: ${n.message}`}>Take down</button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {adding && (
        <NoticeFormModal onClose={() => setAdding(false)}
          onDone={() => { toast.success('Notice posted.'); notices.reload() }} />
      )}
      {removing && (
        <ConfirmDialog
          open
          title="Take this notice down?"
          message="It stops showing straight away. It stays in this list, marked as taken down."
          confirmLabel="Take down"
          tone="danger"
          onConfirm={async () => {
            await adminApi.removeNotice(removing.id)
            toast.success('Notice taken down.')
            notices.reload()
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}

const BLANK = { message: '', audience: 'all', level: 'info', expires_on: '' }

function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function NoticeFormModal({ onClose, onDone }) {
  const [form, setForm] = useState(BLANK)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const message = form.message.trim()
    if (!message) {
      setErrors({ message: 'Write a message.' })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      await adminApi.createNotice({ ...form, message, expires_on: form.expires_on || null })
      onDone()
      onClose()
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(Object.keys(fields).length ? fields : { form: getErrorMessage(err) })
      setBusy(false)
    }
  }

  return (
    <Modal open title="Add notice" onClose={onClose} busy={busy}
      description="It shows at the top of the dashboard for the people you choose, until you take it down or its last day ends.">
      <form onSubmit={submit} noValidate>
        {errors.form && <div className="alert-soft error mb-3" role="alert">{errors.form}</div>}
        <Field id="notice-message" label="Message" error={errors.message} hint="Up to 300 characters.">
          <textarea {...fieldProps('notice-message', errors.message, 'hint')} rows={3} maxLength={300}
            value={form.message} onChange={set('message')} data-autofocus />
        </Field>
        <div className="row g-3">
          <div className="col-sm-6">
            <Field id="notice-audience" label="Who sees it">
              <select id="notice-audience" className="form-select" value={form.audience} onChange={set('audience')}>
                {Object.entries(AUDIENCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>
          <div className="col-sm-6">
            <Field id="notice-level" label="Type">
              <select id="notice-level" className="form-select" value={form.level} onChange={set('level')}>
                <option value="info">Info</option>
                <option value="warning">Important</option>
              </select>
            </Field>
          </div>
        </div>
        <Field id="notice-expires" label="Last day (optional)" error={errors.expires_on}
          hint="Leave empty to show it until you take it down.">
          <input {...fieldProps('notice-expires', errors.expires_on, 'hint')} type="date" min={todayISO()}
            value={form.expires_on} onChange={set('expires_on')} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Posting…' : 'Post notice'}</button>
        </div>
      </form>
    </Modal>
  )
}

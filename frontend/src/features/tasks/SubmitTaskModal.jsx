import { useState } from 'react'
import { tasksApi } from '../../api/tasks'
import Modal from '../../components/ui/Modal'
import { getErrorMessage } from '../../utils/errors'
import { formatPoints } from '../../utils/format'

/**
 * "I did it": a kid sends a task to a parent to check, with an optional note.
 * Shown while `task` is set; rendered only then, so the note starts empty each time.
 */
export default function SubmitTaskModal({ task, ...props }) {
  if (!task) return null
  return <SubmitForm task={task} {...props} />
}

function SubmitForm({ task, onClose, onSubmitted }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await tasksApi.submit(task.id, note.trim())
      onSubmitted(result.task)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Done with “${task.title}”?`} onClose={onClose} busy={busy}
      description={`A parent will check it. You get ${formatPoints(task.points)} once it's approved.`}>
      <form onSubmit={handleSubmit}>
        <label htmlFor="submit-note" className="form-label">Note for your parent (optional)</label>
        <textarea id="submit-note" className="form-control" rows={2} maxLength={500}
          value={note} onChange={(e) => setNote(e.target.value)} />

        {error && <div className="alert-soft error mt-3" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy} data-autofocus>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

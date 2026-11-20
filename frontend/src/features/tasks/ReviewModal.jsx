import { useState } from 'react'
import { tasksApi } from '../../api/tasks'
import { Avatar } from '../../components/ui/Avatar'
import Modal from '../../components/ui/Modal'
import { PointsPill } from '../../components/ui/Pills'
import { getErrorMessage } from '../../utils/errors'
import { notifyApprovalsChanged } from './approvalsEvents'
import SubmissionPhoto from './SubmissionPhoto'

/**
 * A parent approves an "I did it" (the kid gets the points) or sends it back with a note.
 * `review` = { submission, action: 'approve' | 'reject' }; rendered only while it's set.
 * onDone(result, action).
 */
export default function ReviewModal({ review, ...props }) {
  if (!review) return null
  return <ReviewForm review={review} {...props} />
}

function ReviewForm({ review, onClose, onDone }) {
  const { submission, action } = review
  const approving = action === 'approve'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = approving
        ? await tasksApi.approve(submission.id, note.trim())
        : await tasksApi.reject(submission.id, note.trim())
      notifyApprovalsChanged()
      onDone(result, action)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={approving ? 'Approve this task?' : 'Send it back?'} onClose={onClose} busy={busy}>
      <form onSubmit={handleSubmit}>
        <div className="mb-3" style={{ borderLeft: '3px solid var(--border-strong)', paddingLeft: 12 }}>
          <div className="d-flex justify-content-between align-items-baseline gap-2">
            <span className="fw-600">{submission.task?.title}</span>
            <PointsPill value={submission.task?.points} />
          </div>
          <div className="small-text text-2 d-flex align-items-center gap-1 mt-1">
            <Avatar emoji={submission.child?.avatar} size="sm" /> {submission.child?.display_name}
          </div>
          {submission.note && <p className="small-text mt-2">“{submission.note}”</p>}
          {submission.has_photo && <SubmissionPhoto submission={submission} size={220} />}
        </div>
        <label htmlFor="review-note" className="form-label">
          {approving ? 'Note (optional)' : 'What still needs doing? (optional)'}
        </label>
        <textarea id="review-note" className="form-control" rows={2} maxLength={500} value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={approving ? 'Thanks, that looks good.' : 'The pillows still need doing.'}
          data-autofocus />
        {error && <div className="alert-soft error mt-3" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn ${approving ? 'primary' : 'secondary'}`} disabled={busy}>
            {busy ? 'Saving…' : approving ? `Approve (+${submission.task?.points} pts)` : 'Send back'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

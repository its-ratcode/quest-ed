import { useEffect, useState } from 'react'
import { tasksApi } from '../../api/tasks'
import Modal from '../../components/ui/Modal'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'
import { formatPoints } from '../../utils/format'

const MAX_PHOTO = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png']

/**
 * "I did it": a kid sends a task to a parent to check, with an optional note and photo.
 * Shown while `task` is set; rendered only then, so it starts empty each time.
 */
export default function SubmitTaskModal({ task, ...props }) {
  if (!task) return null
  return <SubmitForm task={task} {...props} />
}

function SubmitForm({ task, onClose, onSubmitted }) {
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null) // { file, url } — url is a preview made in the browser
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Free each preview once it's replaced, removed, or the window closes.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])

  function pick(event) {
    const file = event.target.files?.[0] || null
    event.target.value = '' // picking the same file again still counts as a change
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) {
      setError('Use a JPEG or PNG photo.')
      return
    }
    if (file.size > MAX_PHOTO) {
      setError('That photo is too big. Use one under 5 MB.')
      return
    }
    setError(null)
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await tasksApi.submit(task.id, note.trim(), photo?.file)
      onSubmitted(result.task)
      onClose()
    } catch (err) {
      setError(getFieldErrors(err).photo || getErrorMessage(err))
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

        <div className="mt-3">
          <span className="form-label d-block">Photo (optional)</span>
          <div className="photo-pick">
            {photo && <img src={photo.url} alt="The photo you picked" />}
            <label className="btn secondary small" style={{ cursor: 'pointer' }}>
              {photo ? 'Pick another' : 'Add a photo'}
              <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={pick}
                disabled={busy} hidden />
            </label>
            {photo && (
              <button type="button" className="btn quiet small" onClick={() => setPhoto(null)} disabled={busy}>
                Remove
              </button>
            )}
          </div>
          <p className="tiny-text text-3 mt-1 mb-0">Only your parents see it. Location info is removed.</p>
        </div>

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

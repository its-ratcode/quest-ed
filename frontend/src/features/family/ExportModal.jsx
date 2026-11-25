import { useState } from 'react'
import { familyApi } from '../../api/family'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast/useToast'
import { getErrorMessage } from '../../utils/errors'

const PERIODS = [['', 'Everything'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']]

/**
 * Download the family's data (or one kid's, with `child`) as a JSON file to keep.
 * Rendered only while open, so it starts fresh each time.
 */
export default function ExportModal({ open, ...props }) {
  if (!open) return null
  return <ExportForm {...props} />
}

function ExportForm({ kids = [], child = null, onClose }) {
  const toast = useToast()
  const [who, setWho] = useState(child ? String(child.id) : '')
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const name = await familyApi.downloadExport({
        ...(who ? { child_id: Number(who) } : {}), ...(days ? { days: Number(days) } : {}),
      })
      toast.success(`Downloaded ${name}.`)
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={child ? `Export ${child.display_name}'s data` : 'Export your family\'s data'} onClose={onClose}
      busy={busy}
      description="A JSON file with tasks, routines, points, rewards and badges, to keep or look through. No emails, usernames or passwords are in it.">
      {!child && (
        <div className="mb-3">
          <label htmlFor="export-who" className="form-label">Who</label>
          <select id="export-who" className="form-select" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">The whole family</option>
            {kids.map((k) => <option key={k.id} value={k.id}>{k.display_name}</option>)}
          </select>
        </div>
      )}
      <div className="mb-3">
        <label htmlFor="export-days" className="form-label">Period</label>
        <select id="export-days" className="form-select" value={days} onChange={(e) => setDays(e.target.value)}>
          {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={download} disabled={busy}>
          {busy ? 'Preparing…' : 'Download'}
        </button>
      </div>
    </Modal>
  )
}

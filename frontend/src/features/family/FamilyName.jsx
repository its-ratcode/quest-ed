import { useState } from 'react'
import Icon from '../../components/ui/Icon'

/** The family's name as the page title, with a pencil button for parents to rename it in place. */
export function FamilyName({ name, editable, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)

  if (!editable || !editing) {
    return (
      <div className="d-flex align-items-center gap-2">
        <h1>{name}</h1>
        {editable && (
          <button type="button" className="btn quiet square" aria-label="Rename the family" title="Rename"
            onClick={() => {
              setValue(name)
              setEditing(true)
            }}>
            <Icon name="pencil" size={16} />
          </button>
        )}
      </div>
    )
  }

  async function save(event) {
    event.preventDefault()
    if (!value.trim() || busy) return
    setBusy(true)
    try {
      await onSave(value.trim())
      setEditing(false)
    } catch {
      // onSave shows the error; stay in edit mode so nothing typed is lost.
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="d-flex gap-2 flex-wrap" onSubmit={save}>
      <label htmlFor="family-name" className="visually-hidden">Family name</label>
      <input id="family-name" className="form-control" style={{ maxWidth: 320 }} maxLength={80} value={value}
        onChange={(e) => setValue(e.target.value)} autoFocus />
      <button type="submit" className="btn primary small" disabled={busy}>Save</button>
      <button type="button" className="btn secondary small" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  )
}

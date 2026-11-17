import { useState } from 'react'
import { deviceTimezone } from '../../utils/time'

/** When the family's day starts. Offers this device's time zone when it differs. */
export function TimezoneCard({ timezone, onChange }) {
  const device = deviceTimezone()
  const [busy, setBusy] = useState(false)
  const mismatch = device && device !== timezone

  async function switchToDevice() {
    setBusy(true)
    try {
      await onChange(device)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card pad widget span-4" aria-labelledby="tz-title">
      <div className="section-top">
        <div>
          <h2 id="tz-title" className="section-title">Time zone</h2>
          <p className="section-sub">When a new day starts</p>
        </div>
      </div>
      <p className="small-text text-2 widget-body">New days start at midnight, {timezone} time.</p>
      {mismatch && (
        <div className="widget-foot">
          <button type="button" className="btn secondary small" disabled={busy} onClick={switchToDevice}>
            Switch to {device}
          </button>
        </div>
      )}
    </section>
  )
}

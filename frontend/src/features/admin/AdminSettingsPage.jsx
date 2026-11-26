import { useState } from 'react'
import { adminApi } from '../../api/admin'
import { useSiteConfig } from '../../auth/useSiteConfig'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useToast } from '../../components/ui/toast/useToast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../utils/errors'

const HELP = {
  registration: 'When off, nobody can create a new parent account. Existing families are not affected.',
  focus_mode: "When off, kids don't see the focus timer. Focus time already saved is kept.",
}

/** Site-wide switches. Each one saves as soon as it's flipped. */
export default function AdminSettingsPage() {
  const toast = useToast()
  const site = useSiteConfig()
  const settings = useApi((signal) => adminApi.settings(signal), [])
  const [saved, setSaved] = useState(null) // the switches after a change, until the page is reloaded
  const [busy, setBusy] = useState(null)

  if (settings.loading && !settings.data) return <LoadingState label="Loading settings" />
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />

  const { labels } = settings.data
  const features = saved || settings.data.features

  async function flip(key) {
    if (busy) return
    setBusy(key)
    try {
      const data = await adminApi.saveSettings({ [key]: !features[key] })
      setSaved(data.features)
      toast.success(`${labels[key]}: ${data.features[key] ? 'on' : 'off'}.`)
      site.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Site settings</h1>
          <p>Turn parts of the site on or off for everyone.</p>
        </div>
      </div>
      <section className="card-soft settings-card" aria-label="Site switches">
        {Object.keys(labels).map((key) => (
          <div key={key} className="settings-row">
            <div>
              <div className="fw-600" id={`setting-${key}`}>{labels[key]}</div>
              {HELP[key] && <div className="small-text text-2" id={`setting-${key}-help`}>{HELP[key]}</div>}
            </div>
            <button type="button" role="switch" className={`switch${features[key] ? ' on' : ''}`}
              aria-checked={features[key]} aria-labelledby={`setting-${key}`}
              aria-describedby={HELP[key] ? `setting-${key}-help` : undefined}
              disabled={busy === key} onClick={() => flip(key)} />
          </div>
        ))}
      </section>
    </>
  )
}

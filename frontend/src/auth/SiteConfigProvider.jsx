import { useCallback, useEffect, useMemo, useState } from 'react'
import { siteApi } from '../api/site'
import { DEFAULT_FEATURES, SiteConfigContext } from './siteConfigContext'

const fromServer = (data) => ({
  features: { ...DEFAULT_FEATURES, ...data.features }, needsSetup: Boolean(data.needs_setup), loaded: true,
})

/** Asks the server which site switches are on and whether the site still needs setting up. */
export function SiteConfigProvider({ children }) {
  const [config, setConfig] = useState({ features: DEFAULT_FEATURES, needsSetup: false, loaded: false })
  // Can't tell: carry on as a set-up site; the API still refuses what isn't allowed.
  const giveUp = useCallback(() => setConfig((c) => ({ ...c, loaded: true })), [])

  useEffect(() => {
    const controller = new AbortController()
    siteApi
      .config(controller.signal)
      .then((data) => setConfig(fromServer(data)))
      .catch(() => {
        if (!controller.signal.aborted) giveUp()
      })
    return () => controller.abort()
  }, [giveUp])

  /** Ask again, e.g. right after setup. */
  const refresh = useCallback(async () => {
    try {
      setConfig(fromServer(await siteApi.config()))
    } catch {
      giveUp()
    }
  }, [giveUp])

  const value = useMemo(() => ({ ...config, refresh }), [config, refresh])
  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>
}

import { createContext } from 'react'

// Until the server answers, sign-ups count as open; the API still checks.
export const DEFAULT_FEATURES = { registration: true, focus_mode: true }

// Without a provider (as in most tests) the site counts as set up and loaded.
export const SiteConfigContext = createContext({
  features: DEFAULT_FEATURES, needsSetup: false, loaded: true, refresh: () => Promise.resolve(),
})

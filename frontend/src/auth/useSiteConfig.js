import { useContext } from 'react'
import { SiteConfigContext } from './siteConfigContext'

/** { features, needsSetup, loaded, refresh } for this site. */
export function useSiteConfig() {
  return useContext(SiteConfigContext)
}

import { api, unwrap } from './client'

/** What the web app needs to know about this site (public), and the notices banner. */
export const siteApi = {
  config: (signal) => unwrap(api.get('/site/config', { signal })),
  notices: (signal) => unwrap(api.get('/site/notices', { signal })),
}

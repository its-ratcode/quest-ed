import { api, unwrap } from './client'

/** Everything a signed-in person's first page needs, in one request (it depends on their role). */
export const dashboardApi = {
  summary: (signal) => unwrap(api.get('/dashboard/summary', { signal })),
}

import { api, unwrap } from './client'

/** How a kid's last days went (parents only). */
export const reportApi = {
  /** The last `days` days (30 unless given), today included. */
  get: (childId, signal, days) => unwrap(api.get('/report', { params: { child_id: childId, days }, signal })),
}

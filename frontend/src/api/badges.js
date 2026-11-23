import { api, unwrap } from './client'

/** Badges: what kids earn, and the ones parents make. */
export const badgesApi = {
  /** A kid's badges with progress, and their streak. Parents pass { child_id }. */
  progress: (params, signal) => unwrap(api.get('/badges/progress', { params, signal })),
  /** The family's badges (parents), each with earned_count. */
  list: (signal) => unwrap(api.get('/badges', { signal })),
  create: (payload) => unwrap(api.post('/badges', payload)),
  update: (id, payload) => unwrap(api.patch(`/badges/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/badges/${id}`)),
  /** Bring back removed starter badges: { added }. */
  restoreStarters: () => unwrap(api.post('/badges/starters')),
  /** Give a badge to a kid by hand, with its prize. */
  award: (id, childId) => unwrap(api.post(`/badges/${id}/award`, { child_id: childId })),
}

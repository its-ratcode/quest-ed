import { api, unwrap } from './client'

/** Kids' points: what they can spend, the history of every change, and parents' changes by hand. */
export const pointsApi = {
  /** Points to spend, earned and spent in total. Parents pass { child_id }. */
  summary: (params, signal) => unwrap(api.get('/points/summary', { params, signal })),
  /** History, newest first: { items, total, page, per_page }. Parents may pass { child_id }. */
  transactions: (params, signal) => unwrap(api.get('/points/transactions', { params, signal })),
  /** Add (amount > 0) or take away (amount < 0) points, with a reason the kid sees. */
  adjust: (payload) => unwrap(api.post('/points/adjustments', payload)),
}

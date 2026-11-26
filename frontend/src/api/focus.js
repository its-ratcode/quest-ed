import { api, unwrap } from './client'

/** How far the server's clock is ahead of this device, so a wrong device clock doesn't matter. */
const withOffset = (promise) =>
  unwrap(promise).then((data) => ({ ...data, offsetMs: new Date(data.server_now).getTime() - Date.now() }))

/** The kids' focus timer. Each call returns the whole state: { active, recent, completed_count, total_minutes }. */
export const focusApi = {
  /** params: { child_id? } (parents) */
  get: (params, signal) => withOffset(api.get('/focus', { params, signal })),
  start: (minutes, label) => withOffset(api.post('/focus', { minutes, label })),
  finish: (id) => withOffset(api.post(`/focus/${id}/finish`)),
  cancel: (id) => withOffset(api.post(`/focus/${id}/cancel`)),
}

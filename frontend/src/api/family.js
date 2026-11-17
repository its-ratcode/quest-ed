import { api, unwrap } from './client'

/** Your family, its settings, and your kids' accounts. */
export const familyApi = {
  get: (signal) => unwrap(api.get('/family', { signal })),
  rename: (name) => unwrap(api.patch('/family', { name })),
  setTimezone: (timezone) => unwrap(api.patch('/family', { timezone })),
  newInviteCode: () => unwrap(api.post('/family/invite-code')),
  createChild: (payload) => unwrap(api.post('/family/children', payload)),
  updateChild: (id, payload) => unwrap(api.patch(`/family/children/${id}`, payload)),
  removeChild: (id, password) => unwrap(api.delete(`/family/children/${id}`, { data: { password } })),
}

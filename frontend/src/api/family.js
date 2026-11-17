import { api, unwrap } from './client'

/** Your family, and your kids' accounts. */
export const familyApi = {
  get: (signal) => unwrap(api.get('/family', { signal })),
  createChild: (payload) => unwrap(api.post('/family/children', payload)),
  updateChild: (id, payload) => unwrap(api.patch(`/family/children/${id}`, payload)),
  removeChild: (id, password) => unwrap(api.delete(`/family/children/${id}`, { data: { password } })),
}

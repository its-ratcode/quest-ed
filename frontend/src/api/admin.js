import { api, unwrap } from './client'

/** Running the site (administrators only). */
export const adminApi = {
  stats: (signal) => unwrap(api.get('/admin/stats', { signal })),
  /** params: { q?, role?, status?, page? } */
  users: (params, signal) => unwrap(api.get('/admin/users', { params, signal })),
  setUserActive: (id, isActive) => unwrap(api.patch(`/admin/users/${id}`, { is_active: isActive })),
  setUserPassword: (id, password) => unwrap(api.patch(`/admin/users/${id}`, { password })),
}

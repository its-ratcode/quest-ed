import { api, unwrap } from './client'

/** Running the site (administrators only). */
export const adminApi = {
  stats: (signal) => unwrap(api.get('/admin/stats', { signal })),
  /** params: { q?, role?, status?, page? } */
  users: (params, signal) => unwrap(api.get('/admin/users', { params, signal })),
  setUserActive: (id, isActive) => unwrap(api.patch(`/admin/users/${id}`, { is_active: isActive })),
  setUserPassword: (id, password) => unwrap(api.patch(`/admin/users/${id}`, { password })),
  /** { features: { registration: true }, labels: { registration: 'New parent sign-ups' } } */
  settings: (signal) => unwrap(api.get('/admin/settings', { signal })),
  saveSettings: (features) => unwrap(api.put('/admin/settings', { features })),
  /** params: { action?, page? }; action is a prefix such as "task." */
  auditLogs: (params, signal) => unwrap(api.get('/admin/audit-logs', { params, signal })),
  notices: (signal) => unwrap(api.get('/admin/notices', { signal })),
  /** { message, level, audience, expires_on } */
  createNotice: (notice) => unwrap(api.post('/admin/notices', notice)),
  removeNotice: (id) => unwrap(api.delete(`/admin/notices/${id}`)),
}

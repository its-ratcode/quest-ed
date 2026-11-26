import { api, unwrap } from './client'

/** Sign-up, sign-in, the current session, and your own profile. */
export const authApi = {
  me: (signal) => unwrap(api.get('/auth/me', { signal })),
  login: (identifier, password) => unwrap(api.post('/auth/login', { identifier, password })),
  register: (payload) => unwrap(api.post('/auth/register', payload)),
  /** First run only: create the site's administrator. */
  setup: (payload) => unwrap(api.post('/auth/setup', payload)),
  logout: () => unwrap(api.post('/auth/logout')),
  updateMe: (payload) => unwrap(api.patch('/auth/me', payload)),
  changePassword: (payload) => unwrap(api.post('/auth/change-password', payload)),
  /** A parent opens one of their kids' accounts in this browser. */
  viewAs: (childId) => unwrap(api.post(`/auth/view-as/${childId}`)),
  /** Back to the parent who opened the kid's account; needs that parent's password. */
  switchBack: (password) => unwrap(api.post('/auth/switch-back', { password })),
}

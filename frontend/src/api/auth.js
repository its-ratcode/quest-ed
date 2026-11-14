import { api, unwrap } from './client'

/** Sign-up, sign-in and the current session. */
export const authApi = {
  me: (signal) => unwrap(api.get('/auth/me', { signal })),
  login: (identifier, password) => unwrap(api.post('/auth/login', { identifier, password })),
  register: (payload) => unwrap(api.post('/auth/register', payload)),
  logout: () => unwrap(api.post('/auth/logout')),
}

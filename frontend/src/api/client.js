import axios from 'axios'

/**
 * The one HTTP client for the app.
 *
 * - Sessions live in HttpOnly cookies set by the API; scripts never see them.
 * - Writes carry the CSRF header, copied from the readable csrf_* cookie.
 * - When the short session has expired, one refresh request is made and every
 *   waiting request is retried once.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
})

const SAFE_METHODS = ['get', 'head', 'options']
const REFRESH_SCOPED = ['/auth/refresh', '/auth/logout']
const NEVER_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']
const REFRESHABLE_ERRORS = ['token_expired', 'unauthorized', 'csrf_failed', 'invalid_token']

export function readCookie(name) {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

const startsWithAny = (url, prefixes) => prefixes.some((p) => (url || '').startsWith(p))

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (!SAFE_METHODS.includes(method)) {
    const cookieName = startsWithAny(config.url, REFRESH_SCOPED) ? 'csrf_refresh_token' : 'csrf_access_token'
    const token = readCookie(cookieName)
    if (token) config.headers['X-CSRF-TOKEN'] = token
  }
  return config
})

let refreshPromise = null
let sessionExpiredHandler = () => {}

/** Called when the session can't be renewed (signed out elsewhere, account switched off…). */
export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler || (() => {})
}

function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = api.post('/auth/refresh').finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error
    if (!config || !response || response.status !== 401) throw error
    if (config._retried || startsWithAny(config.url, NEVER_REFRESH)) throw error

    const code = response.data?.error
    if (!REFRESHABLE_ERRORS.includes(code)) {
      // Session ended or account switched off: refreshing can't help.
      sessionExpiredHandler(code)
      throw error
    }

    config._retried = true
    try {
      await refreshSession()
    } catch {
      sessionExpiredHandler('refresh_failed')
      throw error
    }
    return api(config)
  },
)

export const unwrap = (promise) => promise.then((res) => res.data)

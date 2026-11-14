/** A backslash or an invisible control character (tab, newline…). */
const isUnsafeChar = (char) => char === '\\' || char.charCodeAt(0) < 32

/**
 * Where to go after signing in: only a path inside this app, never another site
 * (no "open redirects"). Browsers treat "/\evil.com" like "//evil.com", so backslashes
 * and control characters are refused too.
 */
export function safeReturnPath(from) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')
      || [...from].some(isUnsafeChar)) return '/dashboard'
  if (from.startsWith('/login') || from.startsWith('/register')) return '/dashboard'
  return from
}

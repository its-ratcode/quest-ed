import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authApi } from '../api/auth'
import { setSessionExpiredHandler } from '../api/client'
import { AuthContext } from './authContext'

/**
 * Who is signed in. The answer always comes from the server (/auth/me), never from
 * the browser. status: 'loading' | 'authenticated' | 'anonymous'
 */
export function AuthProvider({ children }) {
  // actingParent: set while a parent is using one of their kids' accounts.
  const [state, setState] = useState({ status: 'loading', user: null, family: null, actingParent: null, notice: null })
  const statusRef = useRef('loading')

  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  const applyMe = useCallback((me) => {
    setState({
      status: 'authenticated', user: me.user, family: me.family, actingParent: me.acting_parent || null, notice: null,
    })
    return me
  }, [])

  // signedOut: someone pressed "Sign out" (rather than a session running out). The next person to
  // sign in may be someone else, so they start on their own home page, not the last one open.
  const clearSession = useCallback((notice = null, signedOut = false) => {
    setState({ status: 'anonymous', user: null, family: null, actingParent: null, notice, signedOut })
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession(statusRef.current === 'authenticated' ? 'Your session ended. Please sign in again.' : null)
    })
    const controller = new AbortController()
    authApi
      .me(controller.signal)
      .then(applyMe)
      .catch(() => {
        if (!controller.signal.aborted) clearSession()
      })
    return () => {
      controller.abort()
      setSessionExpiredHandler(null)
    }
  }, [applyMe, clearSession])

  const login = useCallback(async (identifier, password) => {
    await authApi.login(identifier, password)
    return applyMe(await authApi.me())
  }, [applyMe])

  const register = useCallback(async (payload) => {
    await authApi.register(payload)
    return applyMe(await authApi.me())
  }, [applyMe])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      clearSession(null, true)
    }
  }, [clearSession])

  const refreshUser = useCallback(async () => applyMe(await authApi.me()), [applyMe])

  /** A parent opens one of their kids' accounts in this browser. */
  const viewAsChild = useCallback(async (childId) => {
    await authApi.viewAs(childId)
    return applyMe(await authApi.me())
  }, [applyMe])

  /** Back from the kid's account to the parent; needs the parent's password. */
  const switchBack = useCallback(async (password) => {
    await authApi.switchBack(password)
    return applyMe(await authApi.me())
  }, [applyMe])

  const value = useMemo(
    () => ({ ...state, login, register, logout, refreshUser, viewAsChild, switchBack }),
    [state, login, register, logout, refreshUser, viewAsChild, switchBack],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

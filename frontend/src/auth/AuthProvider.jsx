import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authApi } from '../api/auth'
import { setSessionExpiredHandler } from '../api/client'
import { AuthContext } from './authContext'

/**
 * Who is signed in. The answer always comes from the server (/auth/me), never from
 * the browser. status: 'loading' | 'authenticated' | 'anonymous'
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, family: null, notice: null })
  const statusRef = useRef('loading')

  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  const applyMe = useCallback((me) => {
    setState({ status: 'authenticated', user: me.user, family: me.family, notice: null })
    return me
  }, [])

  const clearSession = useCallback((notice = null) => {
    setState({ status: 'anonymous', user: null, family: null, notice })
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
      clearSession()
    }
  }, [clearSession])

  const refreshUser = useCallback(async () => applyMe(await authApi.me()), [applyMe])

  const value = useMemo(
    () => ({ ...state, login, register, logout, refreshUser }),
    [state, login, register, logout, refreshUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

import { useContext } from 'react'
import { AuthContext } from './authContext'

/**
 * The session: { status, user, family, actingParent, notice, login, register, logout, refreshUser,
 * viewAsChild, switchBack }. actingParent is set while a parent uses one of their kids' accounts.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

import { useContext } from 'react'
import { AuthContext } from './authContext'

/**
 * The session: { status, user, family, actingParent, notice, signedOut, login, register, logout, refreshUser,
 * viewAsChild, switchBack }. actingParent is set while a parent uses one of their kids' accounts;
 * signedOut is true after someone pressed "Sign out" (rather than their session running out).
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

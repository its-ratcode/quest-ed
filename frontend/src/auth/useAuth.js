import { useContext } from 'react'
import { AuthContext } from './authContext'

/** The session: { status, user, family, notice, login, register, logout, refreshUser }. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

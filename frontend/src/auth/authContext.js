import { createContext } from 'react'

/** Holds the session: see AuthProvider (fills it) and useAuth (reads it). */
export const AuthContext = createContext(null)

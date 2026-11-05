import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type Role = 'manager' | 'executor'
export type Profile = { id: string; role: Role }
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; session: Session; profile: Profile }
  | { status: 'error'; message: string; session: Session | null }

type AuthContextValue = {
  state: AuthState
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is required')
  return context
}

export function homeForRole(role: Role) {
  return role === 'manager' ? '/objects' : '/my-tasks'
}

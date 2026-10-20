'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AuthUser } from '@/lib/auth/post-auth-redirect'

type AuthGateContextValue = {
  /** Null when the visitor is logged out (guest on home). */
  me: AuthUser | null
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null)

export function AuthGateProvider({ me, children }: { me: AuthUser | null; children: ReactNode }) {
  return <AuthGateContext.Provider value={{ me }}>{children}</AuthGateContext.Provider>
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext)
  if (!ctx) throw new Error('useAuthGate must be used inside AuthGate')
  return ctx
}

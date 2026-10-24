'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AuthUser } from '@/lib/auth/post-auth-redirect'

type AuthGateContextValue = {
  /** Null when the visitor is logged out (guest on home). */
  me: AuthUser | null
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null)

export function AuthGateProvider({ me, children }: { me: AuthUser | null; children: ReactNode }) {
  const value = useMemo(() => ({ me }), [me?.setupComplete, me?.setupStep, me === null])
  return <AuthGateContext.Provider value={value}>{children}</AuthGateContext.Provider>
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext)
  if (!ctx) throw new Error('useAuthGate must be used inside AuthGate')
  return ctx
}

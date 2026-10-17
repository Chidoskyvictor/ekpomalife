'use client'

import type { ReactNode } from 'react'
import { AuthGate } from '@/components/auth/auth-gate'

/** Shared gate for look → traits → dream → live so the gate does not remount on each step. */
export default function SetupLayout({ children }: { children: ReactNode }) {
  return <AuthGate mode="setup">{children}</AuthGate>
}

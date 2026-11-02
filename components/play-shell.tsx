'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { AuthGate } from '@/components/auth/auth-gate'
import { Hud } from '@/components/hud/hud'
import { OfflineBanner } from '@/components/world/map-stage'
import { EconomyProvider } from '@/hooks/use-economy'
import { GameProvider } from '@/hooks/use-game'
import { useAuthGate } from '@/lib/auth/auth-gate-context'

/** Pages that are part of the game: the map, Home (rooms) and clubs. */
export function isPlayPath(pathname: string | null) {
  if (!pathname) return false
  return pathname === '/' || pathname === '/room' || pathname.startsWith('/room/') || pathname.startsWith('/club/')
}

function PlayProviders({ children }: { children: ReactNode }) {
  const { me } = useAuthGate()
  return (
    <GameProvider guest={!me}>
      <EconomyProvider>
        <main className="relative h-dvh w-full overflow-hidden">
          <h1 className="sr-only">Ekpoma Life</h1>
          {children}
          <Hud />
          <OfflineBanner />
        </main>
      </EconomyProvider>
    </GameProvider>
  )
}

/**
 * Lives in the root layout, so it stays mounted while you move between the map, Home and clubs:
 * the HUD, game state and sign-in check load once instead of on every tab.
 */
export function PlayShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (!isPlayPath(pathname)) return <>{children}</>
  return (
    <AuthGate mode="home">
      <PlayProviders>{children}</PlayProviders>
    </AuthGate>
  )
}

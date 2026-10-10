'use client'

import { AuthLinks } from '@/components/hud/auth-links'
import { usePlayerStats } from '@/hooks/use-player-stats'

export function WelcomeCard() {
  const { online } = usePlayerStats()

  return (
    <section
      aria-label="Join Ekpoma Life"
      className="liquid-glass pointer-events-auto mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-full py-3 pr-3 pl-5"
    >
      <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground/80 sm:text-sm">
        <span className="relative flex size-2 shrink-0" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#1fb978] opacity-60" />
          <span className="relative size-2 rounded-full bg-[#1fb978]" />
        </span>
        <span className="truncate">
          <span className="tabular-nums">{online.toLocaleString()}</span> Esanites playing right now · free
        </span>
      </p>
      <AuthLinks size="lg" signupFirst />
    </section>
  )
}

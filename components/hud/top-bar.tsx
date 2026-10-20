'use client'

import { AuthLinks } from '@/components/hud/auth-links'
import { usePlayerStats } from '@/hooks/use-player-stats'
import guestStyles from './guest-bar.module.css'
import logoStyles from './logo.module.css'

export function Logo() {
  return (
    <div className={logoStyles.logo}>
      <span className={logoStyles.badge}>
        <img src="/logo.png" alt="Ekpoma Life" width={36} height={36} />
      </span>
      <span className={logoStyles.name}>Ekpoma Life</span>
    </div>
  )
}

export function TopBar() {
  const { online, visits } = usePlayerStats()

  return (
    <header className={guestStyles.bar}>
      <div className={guestStyles.meta}>
        <Logo />
        <span className={guestStyles.stats}>
          <span className={guestStyles.live} aria-hidden="true" />
          {online.toLocaleString()} online
          <span aria-hidden="true">·</span>
          {visits.toLocaleString()} visits
        </span>
      </div>
      <div className={guestStyles.actions}>
        <AuthLinks signupFirst variant="lobby" />
      </div>
    </header>
  )
}

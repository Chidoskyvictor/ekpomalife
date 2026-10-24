'use client'

import { AuthLinks } from '@/components/hud/auth-links'
import hudStyles from './life-hud.module.css'
import logoStyles from './logo.module.css'
import { SiteStats } from './site-stats'

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

/** Guest top bar — same pill as the in-game status bar, solid instead of glass. */
export function TopBar() {
  return (
    <div className={hudStyles.statusStack}>
      <header className={`${hudStyles.statusBar} ${hudStyles.statusSolid}`} aria-label="Ekpoma Life">
        <span className={hudStyles.statusItem}>
          <Logo />
        </span>
        <SiteStats variant="inline" />
        <div className={hudStyles.statusRight}>
          <AuthLinks signupFirst variant="lobby" />
        </div>
      </header>
      <SiteStats variant="dock" />
    </div>
  )
}

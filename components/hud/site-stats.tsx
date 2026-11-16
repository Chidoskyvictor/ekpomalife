'use client'

import { usePlayerStats } from '@/hooks/use-player-stats'
import { compactCount } from '@/lib/game/needs'
import hudStyles from './life-hud.module.css'
import styles from './site-stats.module.css'

function StatsBody({ online, visits }: { online: number; visits: number }) {
  return (
    <>
      <span className={hudStyles.liveDot} aria-hidden="true" />
      <strong>{compactCount(online)}</strong>
      <span className={hudStyles.statusMuted}>online</span>
      <span className={styles.statsSep} aria-hidden="true">·</span>
      <strong>{compactCount(visits)}</strong>
      <span className={hudStyles.statusMuted}>visits</span>
    </>
  )
}

/**
 * Live "online · visits" from GET /stats (real counts — zero shows as zero).
 * `inline` sits inside the top bar on desktop; `dock` is the centred pill under it on mobile.
 */
export function SiteStats({ variant }: { variant: 'inline' | 'dock' }) {
  const { online, visits } = usePlayerStats()
  if (online == null || visits == null) return null
  const label = `${online.toLocaleString()} online, ${visits.toLocaleString()} visits`

  if (variant === 'dock') {
    return (
      <div className={hudStyles.playersDock} aria-label={label}>
        <StatsBody online={online} visits={visits} />
      </div>
    )
  }
  return (
    <>
      <span className={`${hudStyles.statusDivider} ${hudStyles.deskOnly}`} aria-hidden="true" />
      <span className={`${hudStyles.statusItem} ${hudStyles.statusPlayers}`} aria-label={label}>
        <StatsBody online={online} visits={visits} />
      </span>
    </>
  )
}

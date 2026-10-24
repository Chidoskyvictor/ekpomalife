'use client'

import { usePlayerStats } from '@/hooks/use-player-stats'
import { compactCount } from '@/lib/game/needs'
import styles from './life-hud.module.css'

function StatsBody({ online, visits }: { online: number; visits: number }) {
  return (
    <>
      <span className={styles.liveDot} aria-hidden="true" />
      <strong>{compactCount(online)}</strong>
      <span className={styles.statusMuted}>online</span>
      <span className={styles.statsSep} aria-hidden="true">·</span>
      <strong>{compactCount(visits)}</strong>
      <span className={styles.statusMuted}>visits</span>
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
      <div className={styles.playersDock} aria-label={label}>
        <StatsBody online={online} visits={visits} />
      </div>
    )
  }
  return (
    <>
      <span className={`${styles.statusDivider} ${styles.deskOnly}`} aria-hidden="true" />
      <span className={`${styles.statusItem} ${styles.statusPlayers}`} aria-label={label}>
        <StatsBody online={online} visits={visits} />
      </span>
    </>
  )
}

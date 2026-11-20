'use client'

import type { ReactNode } from 'react'
import { PlayerFace } from '@/components/look/player-face'
import type { HubPlayer } from '@/lib/game/games-hub-api'
import styles from './hub.module.css'

export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`

export function Face({ p, size = 40 }: { p: HubPlayer; size?: number }) {
  return <PlayerFace look={p.appearance} color={p.avatarColor} label={p.username} size={size} />
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        {icon}
      </span>
      <b>{title}</b>
      <p className={styles.hint}>{text}</p>
      {action}
    </div>
  )
}

export function Skeletons({ n = 3 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={styles.skeleton} aria-hidden="true" />
      ))}
    </>
  )
}

/** "5h 12m left" / "8m left" */
export function timeLeft(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'expiring'
  const m = Math.floor(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${Math.max(1, m)}m left`
}

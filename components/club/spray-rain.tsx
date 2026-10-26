'use client'

import { useEffect, useState } from 'react'
import type { Spray } from '@/lib/game/club-live'
import styles from './spray-rain.module.css'

/** Where each note falls: spread across the screen, staggered over the spray's time. */
function layout(spray: Spray) {
  const seconds = Math.max(4, (spray.endsAt - Date.now()) / 1000 - 1)
  let seed = spray.id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  return spray.notes.map((n) => ({
    ...n,
    left: 6 + rand() * 82,
    delay: rand() * (seconds - 3),
    fall: 3 + rand() * 1.5,
    tilt: -25 + rand() * 50,
  }))
}

/**
 * Money sprayed in the club, raining over the screen. Tap a note to grab it; the server
 * decides who got it first. Your own spray rains for you too, but you can't pick it.
 */
export function SprayRain({
  sprays,
  lastGot,
  onPick,
}: {
  sprays: Spray[]
  lastGot: { value: number; at: number } | null
  onPick: (sprayId: string, note: number) => void
}) {
  const [tapped, setTapped] = useState<Set<string>>(() => new Set())
  const [pops, setPops] = useState<{ id: number; value: number }[]>([])

  useEffect(() => {
    if (!lastGot) return
    setPops((list) => [...list, { id: lastGot.at, value: lastGot.value }])
    const id = window.setTimeout(() => setPops((list) => list.filter((p) => p.id !== lastGot.at)), 1400)
    return () => window.clearTimeout(id)
  }, [lastGot])

  // Finished sprays drop out by the clock too (background tabs run their timers late)
  const live = sprays.filter((s) => s.endsAt > Date.now())
  const placed = live.map((s) => ({ spray: s, notes: layout(s) }))
  const banner = live[live.length - 1]

  if (!live.length && !pops.length) return null

  return (
    <div className={styles.layer} aria-live="polite">
      {banner ? (
        <div className={styles.banner}>
          💸 {banner.mine ? 'You' : `@${banner.byUsername}`} sprayed ₦{banner.amount.toLocaleString()}
          {banner.mine ? '' : ' · tap to grab!'}
        </div>
      ) : null}
      {placed.map(({ spray, notes }) =>
        notes.map((n) => {
          const key = `${spray.id}:${n.note}`
          if (spray.gone.has(n.note) || tapped.has(key)) return null
          return (
            <button
              key={key}
              type="button"
              className={`${styles.note} ${spray.mine ? styles.mine : ''}`}
              style={{
                left: `${n.left}%`,
                animationDelay: `${n.delay}s`,
                animationDuration: `${n.fall}s`,
                ['--tilt' as string]: `${n.tilt}deg`,
              }}
              disabled={spray.mine}
              aria-label={`Grab ₦${n.value.toLocaleString()}`}
              onPointerDown={() => {
                if (spray.mine) return
                setTapped((s) => new Set(s).add(key))
                onPick(spray.id, n.note)
              }}
            >
              ₦{n.value >= 1000 ? `${Math.round(n.value / 1000)}k` : n.value}
            </button>
          )
        }),
      )}
      {pops.map((p) => (
        <span key={p.id} className={styles.pop}>
          +₦{p.value.toLocaleString()}
        </span>
      ))}
    </div>
  )
}

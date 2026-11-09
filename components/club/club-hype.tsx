'use client'

import { useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { HYPE_TIERS, hypeAtVenue, type HypeTier } from '@/lib/game/venues-api'
import styles from './club-hype.module.css'

/** ₦5m, ₦100m, ₦1bn */
export const shortNaira = (n: number) => (n >= 1_000_000_000 ? `₦${n / 1_000_000_000}bn` : `₦${n / 1_000_000}m`)

/**
 * Pay to hype. `target` set = hype that player (Hype / Mega hype); no target = the whole-club moments
 * (Buy a round / Shut it down). Two taps: the first arms the button and shows the price, the second pays.
 * The server does the paying, cooldowns and block checks; this only asks.
 */
export function ClubHype({
  venueId,
  target,
  onDone,
}: {
  venueId: string
  target?: { userId: string; username: string }
  onDone?: () => void
}) {
  const { notifyToast, refreshServer } = useGame()
  const [armed, setArmed] = useState<HypeTier | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const tiers = HYPE_TIERS.filter((t) => t.target === !!target)

  const pay = async (tier: HypeTier) => {
    if (armed !== tier) {
      setArmed(tier)
      return
    }
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const res = await hypeAtVenue(venueId, tier, target?.userId)
    inFlight.current = false
    setBusy(false)
    setArmed(null)
    notifyToast(res.ok ? res.message : res.error, res.ok)
    if (res.ok) {
      void refreshServer()
      onDone?.()
    }
  }

  return (
    <ul className={styles.grid} aria-label={target ? `Hype @${target.username}` : 'Big moments'}>
      {tiers.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            className={`${styles.tier} ${armed === t.id ? styles.armed : ''}`}
            disabled={busy}
            onClick={() => void pay(t.id)}
          >
            <span className={styles.emoji} aria-hidden="true">
              {t.emoji}
            </span>
            <strong>{armed === t.id ? 'Tap to pay' : t.label}</strong>
            <small>{armed === t.id ? shortNaira(t.price) : `${shortNaira(t.price)} · ${t.blurb}`}</small>
          </button>
        </li>
      ))}
    </ul>
  )
}

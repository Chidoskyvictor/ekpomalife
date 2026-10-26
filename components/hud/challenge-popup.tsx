'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { acceptMatch, closeMatch, fetchMatches, type GameMatch } from '@/lib/game/games-api'
import { requestOpenGames } from '@/lib/game/open-games'
import styles from './challenge-popup.module.css'

/*
 * Game challenges from other players: counts toward the phone badge, and a new one pops a
 * small card (Accept / Decline) unless the phone is already open.
 */
export function useIncomingChallenges(enabled: boolean) {
  const [incoming, setIncoming] = useState<GameMatch[]>([])
  const load = useCallback(async () => {
    const res = await fetchMatches()
    if (res.ok) setIncoming(res.matches.filter((m) => m.incoming))
  }, [])
  useEffect(() => {
    if (!enabled) {
      setIncoming([])
      return
    }
    void load()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 15_000)
    return () => window.clearInterval(id)
  }, [enabled, load])
  return { incoming, reload: load }
}

export function ChallengePopup({
  incoming,
  hidden,
  onDone,
}: {
  incoming: GameMatch[]
  hidden: boolean
  onDone: () => void
}) {
  const seen = useRef(new Set<string>())
  const [shown, setShown] = useState<GameMatch | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (shown && !incoming.some((m) => m.id === shown.id)) setShown(null)
    if (shown || hidden) return
    const next = incoming.find((m) => !seen.current.has(m.id))
    if (next) {
      seen.current.add(next.id)
      setShown(next)
    }
  }, [incoming, hidden, shown])

  if (!shown || hidden) return null
  const stake = shown.stake ? `₦${shown.stake.toLocaleString()} bet` : 'Friendly'
  return (
    <BodyPortal>
      <div className={styles.card} role="alertdialog" aria-label="Game challenge">
        <span className={styles.icon}>🎱</span>
        <span className={styles.text}>
          <strong>{shown.names[0]}</strong>
          <span>challenged you · {stake}</span>
        </span>
        <span className={styles.actions}>
          <button
            type="button"
            className={styles.no}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await closeMatch(shown.id)
              setBusy(false)
              setShown(null)
              onDone()
            }}
          >
            Decline
          </button>
          <button
            type="button"
            className={styles.yes}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const res = await acceptMatch(shown.id)
              setBusy(false)
              setShown(null)
              onDone()
              requestOpenGames(res.ok ? { matchId: res.match.id } : {})
            }}
          >
            Accept
          </button>
        </span>
      </div>
    </BodyPortal>
  )
}

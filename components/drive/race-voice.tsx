'use client'

import { Mic } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { raceVoice, useRaces } from '@/lib/game/races-api'
import styles from './race-voice.module.css'

const RaceVoiceRoom = dynamic(() => import('./race-voice-room'), { ssr: false })

/**
 * Voice for the racers in your race. Nothing connects until you tap Join voice (LiveKit bills every
 * connected minute); then a seat in the race's room, mic off until you tap it. Leaves by itself when
 * the race ends, when you're alone, after long silence, or when the app goes to the background.
 */
export function RaceVoice() {
  const { notifyToast } = useGame()
  const { mine } = useRaces()
  const raceId = mine && (mine.status === 'open' || mine.status === 'running') ? mine.id : null
  const [seat, setSeat] = useState<{ raceId: string; url: string; token: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Race over (or a different race): drop the seat
  useEffect(() => {
    if (seat && seat.raceId !== raceId) setSeat(null)
  }, [raceId, seat])

  if (!raceId) return null
  if (!seat || seat.raceId !== raceId)
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.mic}
          aria-label="Join the racers' voice"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const res = await raceVoice(raceId)
            setBusy(false)
            if (res.ok) setSeat({ raceId, url: res.url, token: res.token })
            else notifyToast(res.error ?? 'Couldn’t join the voice.', false)
          }}
        >
          <Mic size={18} aria-hidden="true" />
        </button>
      </div>
    )
  return (
    <RaceVoiceRoom
      url={seat.url}
      token={seat.token}
      onError={(text) => notifyToast(text, false)}
      onLeave={(text) => {
        setSeat(null)
        if (text) notifyToast(text, false)
      }}
    />
  )
}

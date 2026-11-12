'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { raceVoice, useRaces } from '@/lib/game/races-api'

const RaceVoiceRoom = dynamic(() => import('./race-voice-room'), { ssr: false })

/**
 * Live voice for the racers in your race: a seat in the race's own voice room while it is open or
 * running, mic off until you tap it. Leaves by itself when the race ends.
 */
export function RaceVoice() {
  const { notifyToast } = useGame()
  const { mine } = useRaces()
  const raceId = mine && (mine.status === 'open' || mine.status === 'running') ? mine.id : null
  const [seat, setSeat] = useState<{ raceId: string; url: string; token: string } | null>(null)

  useEffect(() => {
    if (!raceId) return
    let stale = false
    void raceVoice(raceId).then((res) => {
      if (stale) return
      if (res.ok) setSeat({ raceId, url: res.url, token: res.token })
    })
    return () => {
      stale = true
      setSeat(null)
    }
  }, [raceId])

  if (!seat || seat.raceId !== raceId) return null
  return <RaceVoiceRoom url={seat.url} token={seat.token} onError={(text) => notifyToast(text, false)} onDisconnected={() => setSeat(null)} />
}

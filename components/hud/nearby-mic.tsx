'use client'

import { Mic, MicOff } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { useGame } from '@/hooks/use-game'
import { hapticTap } from './haptic'
import styles from './nearby-mic.module.css'
import { nearbyVoice, useNearbyVoice } from './nearby-voice-store'

const NearbyMicRoom = dynamic(() => import('./nearby-mic-room'), { ssr: false })

/**
 * Talk to the people in the place you're in: one live voice room per place (your home is your own).
 * This is the round button on the place sheet. The badge counts who is on the mic here. Tap to join
 * with your mic on, tap again to mute. Leaving the place leaves the voice.
 */
export function NearbyMic({ className, badgeClassName }: { className: string; badgeClassName: string }) {
  const { state, notifyToast } = useGame()
  const place = state?.locationId ?? null
  const v = useNearbyVoice()

  useEffect(() => {
    nearbyVoice.shownChange(1)
    return () => nearbyVoice.shownChange(-1)
  }, [])

  // How many are on the mic here (every 30s and when you move), until you join
  useEffect(() => {
    if (!place || v.seat) return
    void nearbyVoice.refreshCount()
    const t = window.setInterval(() => void nearbyVoice.refreshCount(), 30000)
    return () => window.clearInterval(t)
  }, [place, v.seat])

  if (!place || !v.available) return null

  const inRoom = Boolean(v.seat)
  const badge = inRoom ? v.others : v.count
  const label = !inRoom
    ? badge
      ? `Talk to people here (${badge} on the mic)`
      : 'Talk to people here'
    : `${v.micOn ? 'Mute your mic' : 'Unmute your mic'}${v.talking ? ` · @${v.talking} is talking` : ''}`
  return (
    <button
      type="button"
      className={`${className} ${inRoom && v.micOn ? styles.on : ''} ${v.talking ? styles.hearing : ''}`}
      aria-pressed={inRoom ? v.micOn : undefined}
      aria-label={label}
      title={label}
      disabled={v.busy}
      onClick={() => {
        hapticTap()
        void nearbyVoice.tap((text) => notifyToast(text, false))
      }}
    >
      {inRoom && v.micOn ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
      {badge ? <span className={badgeClassName}>{badge > 9 ? '9+' : badge}</span> : null}
    </button>
  )
}

/** Always mounted with the HUD: holds the voice room so the call survives the sheet re-rendering. */
export function NearbyVoiceHost() {
  const { state, notifyToast } = useGame()
  const place = state?.locationId ?? null
  const { seat } = useNearbyVoice()

  // Moving somewhere else leaves this place's voice
  useEffect(() => {
    if (seat && place && seat.place !== place) nearbyVoice.leave()
  }, [place, seat])

  if (!seat) return null
  return <NearbyMicRoom key={seat.token} url={seat.url} token={seat.token} onError={(text) => notifyToast(text, false)} onLeave={() => nearbyVoice.leave()} />
}

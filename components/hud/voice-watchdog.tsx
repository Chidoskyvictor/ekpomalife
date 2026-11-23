'use client'

import { useParticipants, useSpeakingParticipants } from '@livekit/components-react'
import { useEffect, useRef } from 'react'

/*
 * LiveKit bills every connected minute, mic on or off. Rendered inside a <LiveKitRoom>, this leaves
 * the room when staying connected is only burning minutes:
 *   - alone in the room for `aloneMs` (default 2 min),
 *   - nobody (you included) has said anything for `silentMs` (default 10 min),
 *   - the app is in the background / phone locked for `hiddenMs` (default 30 s; null = never).
 * Draws nothing.
 */
export const VOICE_ALONE_MS = 2 * 60_000
export const VOICE_SILENT_MS = 10 * 60_000
export const VOICE_HIDDEN_MS = 30_000

export function VoiceWatchdog({
  onLeave,
  aloneMs = VOICE_ALONE_MS,
  silentMs = VOICE_SILENT_MS,
  hiddenMs = VOICE_HIDDEN_MS,
}: {
  onLeave: (reason: 'alone' | 'silent' | 'hidden') => void
  aloneMs?: number | null
  silentMs?: number | null
  hiddenMs?: number | null
}) {
  const people = useParticipants()
  const speakers = useSpeakingParticipants()
  const leaveRef = useRef(onLeave)
  leaveRef.current = onLeave
  const lastTalk = useRef(Date.now())
  const aloneSince = useRef<number | null>(null)
  const hiddenSince = useRef<number | null>(null)

  if (speakers.length) lastTalk.current = Date.now()
  const alone = people.length <= 1
  if (!alone) aloneSince.current = null
  else if (aloneSince.current == null) aloneSince.current = Date.now()

  useEffect(() => {
    const onVis = () => {
      hiddenSince.current = document.visibilityState === 'hidden' ? Date.now() : null
    }
    onVis()
    document.addEventListener('visibilitychange', onVis)
    let done = false
    const tick = window.setInterval(() => {
      if (done) return
      const now = Date.now()
      const leave = (reason: 'alone' | 'silent' | 'hidden') => {
        done = true
        leaveRef.current(reason)
      }
      if (hiddenMs != null && hiddenSince.current != null && now - hiddenSince.current >= hiddenMs) leave('hidden')
      else if (aloneMs != null && aloneSince.current != null && now - aloneSince.current >= aloneMs) leave('alone')
      else if (silentMs != null && now - lastTalk.current >= silentMs) leave('silent')
    }, 5000)
    return () => {
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [aloneMs, silentMs, hiddenMs])

  return null
}

export const VOICE_LEFT_TEXT: Record<'alone' | 'silent' | 'hidden', string> = {
  alone: 'Left the voice: nobody else was on it.',
  silent: 'Left the voice: nobody talked for 10 minutes.',
  hidden: 'Left the voice while the app was in the background.',
}

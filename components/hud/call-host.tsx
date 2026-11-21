'use client'

import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants, useSpeakingParticipants } from '@livekit/components-react'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'
import { hapticTap } from './haptic'
import styles from './call-host.module.css'
import { VoiceFaces } from './nearby-mic'
import type { VoiceFace } from './nearby-voice-store'

/**
 * Private voice calls. Call someone from the chat menu; they get a ring (accept / decline); once they
 * accept, a LiveKit room only the two of you can get tokens for (the server checks). Works anywhere:
 * the host is mounted with the HUD, so the call survives moving around the map.
 */
type Call = { id: string; status: 'ringing' | 'active'; direction: 'in' | 'out'; peer: string }
type Seat = { url: string; token: string }

// Tiny store so the chat menu can start a call from anywhere
let startRequest: ((username: string) => Promise<string | null>) | null = null
export const calls = {
  /** Returns an error message, or null when ringing */
  start: (username: string) => (startRequest ? startRequest(username) : Promise.resolve('Calls aren’t ready yet.')),
}
const subs = new Set<() => void>()
let busy = false
export const useCallBusy = () => useSyncExternalStore((l) => (subs.add(l), () => subs.delete(l)), () => busy, () => false)
const setBusy = (b: boolean) => {
  busy = b
  subs.forEach((l) => l())
}

function CallRoom({ seat, peer, onEnd }: { seat: Seat; peer: string; onEnd: () => void }) {
  return (
    <LiveKitRoom serverUrl={seat.url} token={seat.token} connect audio video={false} onDisconnected={onEnd} style={{ display: 'contents' }}>
      <RoomAudioRenderer />
      <CallBar peer={peer} onHangup={onEnd} />
    </LiveKitRoom>
  )
}

function CallBar({ peer, onHangup }: { peer: string; onHangup: () => void }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const people = useParticipants()
  const speakers = useSpeakingParticipants()
  const faces: VoiceFace[] = people.map((p) => ({ id: p.identity, name: p.name || p.identity }))
  const talker = speakers.find((p) => p.identity !== localParticipant.identity)
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  const waiting = people.length < 2
  return (
    <div className={`${styles.bar} ${styles.active}`} role="region" aria-label="Voice call">
      <VoiceFaces faces={faces} />
      <span className={styles.who}>
        <b>@{peer}</b>
        <small>{talker ? <>🔊 @{talker.name || talker.identity}</> : waiting ? 'Waiting for them to connect…' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</small>
      </span>
      <button
        type="button"
        className={`${styles.round} ${isMicrophoneEnabled ? '' : styles.muted}`}
        aria-pressed={!isMicrophoneEnabled}
        aria-label={isMicrophoneEnabled ? 'Mute your mic' : 'Unmute your mic'}
        onClick={() => {
          hapticTap()
          void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {})
        }}
      >
        {isMicrophoneEnabled ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
      </button>
      <button type="button" className={`${styles.round} ${styles.hang}`} aria-label="Hang up" onClick={onHangup}>
        <PhoneOff size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

export function CallHost() {
  const [call, setCall] = useState<Call | null>(null)
  const [seat, setSeat] = useState<Seat | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const joining = useRef<string | null>(null)
  const callRef = useRef<Call | null>(null)
  callRef.current = call

  const poll = useCallback(async () => {
    const res = await apiGet<{ ok: true; call: Call | null }>('/calls')
    if (!res.ok) return
    const had = callRef.current
    setCall(res.call)
    if (!res.call) {
      setSeat(null)
      joining.current = null
      setBusy(false)
      if (had?.direction === 'out' && had.status === 'ringing') setMsg(`@${had.peer} didn’t pick up`)
    } else {
      setBusy(true)
      // Accepted: fetch our token (the server only gives one to the two people on this call)
      if (res.call.status === 'active' && joining.current !== res.call.id) {
        joining.current = res.call.id
        const t = await apiPost<{ ok: true; url: string; token: string }>(`/calls/${res.call.id}/token`, {})
        if (t.ok) setSeat({ url: t.url, token: t.token })
        else joining.current = null
      }
    }
  }, [])

  useEffect(() => {
    startRequest = async (username) => {
      const res = await apiPost<{ ok: true; id: string }>('/calls', { username })
      if (!res.ok) return res.error ?? 'Couldn’t start the call.'
      void poll()
      return null
    }
    void poll()
    const t = window.setInterval(() => void poll(), call ? 2500 : 5000)
    return () => {
      window.clearInterval(t)
      startRequest = null
    }
  }, [poll, call])

  useEffect(() => {
    if (!msg) return
    const t = window.setTimeout(() => setMsg(null), 4000)
    return () => window.clearTimeout(t)
  }, [msg])

  const act = async (action: 'accept' | 'decline' | 'hangup') => {
    if (!call) return
    hapticTap()
    if (action !== 'accept') {
      setSeat(null)
      setCall(null)
      joining.current = null
    }
    await apiPost(`/calls/${call.id}/${action}`, {})
    void poll()
  }

  return (
    <>
      {msg ? (
        <div className={styles.toast} role="status">
          {msg}
        </div>
      ) : null}
      {call && call.status === 'ringing' ? (
        <div className={styles.ring} role="alertdialog" aria-label={call.direction === 'in' ? 'Incoming call' : 'Calling'}>
          <span className={styles.pulse} aria-hidden="true">
            <Phone size={22} />
          </span>
          <span className={styles.who}>
            <b>@{call.peer}</b>
            <small>{call.direction === 'in' ? 'is calling you…' : 'Ringing…'}</small>
          </span>
          {call.direction === 'in' ? (
            <>
              <button type="button" className={`${styles.round} ${styles.hang}`} aria-label="Decline call" onClick={() => void act('decline')}>
                <PhoneOff size={18} aria-hidden="true" />
              </button>
              <button type="button" className={`${styles.round} ${styles.accept}`} aria-label="Accept call" onClick={() => void act('accept')}>
                <Phone size={18} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" className={`${styles.round} ${styles.hang}`} aria-label="Cancel call" onClick={() => void act('hangup')}>
              <PhoneOff size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : null}
      {call && call.status === 'active' ? (
        seat ? (
          <CallRoom key={seat.token} seat={seat} peer={call.peer} onEnd={() => void act('hangup')} />
        ) : (
          <div className={styles.bar}>
            <span className={styles.who}>
              <b>@{call.peer}</b>
              <small>Connecting…</small>
            </span>
            <button type="button" className={`${styles.round} ${styles.hang}`} aria-label="Hang up" onClick={() => void act('hangup')}>
              <PhoneOff size={18} aria-hidden="true" />
            </button>
          </div>
        )
      ) : null}
    </>
  )
}

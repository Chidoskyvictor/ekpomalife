'use client'

import { Hand, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useLive } from '@/components/hud/phone/apps/spaces-live-context'
import { approveSpeaker, fetchSpace, joinSpace, leaveSpace, requestToSpeak, type SpaceCard, type SpaceJoin, type SpacePerson } from '@/lib/game/spaces-api'
import styles from './stage-audio.module.css'

/*
 * The hall's own speakers: while a Space is live on the stage, everyone inside the hall hears it
 * through this connection (it stays up with the phone closed). Walking out of the hall leaves the
 * Space; for the host that ends it. One tap is needed to start sound (browsers block autoplay).
 */

const SpaceLive = dynamic(() => import('@/components/hud/phone/apps/spaces-live'), { ssr: false })

export type StageJoin = SpaceJoin

/** Connect to the live stage Space while `join` is set; leave it when the hall closes. */
export function StageAudio({
  live,
  join,
  onJoin,
  onDrop,
  onSpeaking,
}: {
  live: SpaceCard | null
  join: StageJoin | null
  onJoin: (join: StageJoin) => void
  onDrop: () => void
  /** Who is talking right now (user ids; your own id when it's you) */
  onSpeaking: (ids: string[], localId: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const spaceRef = useRef<string | null>(null)
  spaceRef.current = join?.spaceId ?? null

  // Leaving the hall (or the page) leaves the Space
  useEffect(
    () => () => {
      const id = spaceRef.current
      if (id) void leaveSpace(id)
    },
    [],
  )

  // The Space ended (or another one is up): drop our connection. A new Space may not be in the
  // list yet, so only drop once we've seen ours live and it's gone.
  const seen = useRef(false)
  useEffect(() => {
    if (!join) {
      seen.current = false
      return
    }
    if (live?.id === join.spaceId) seen.current = true
    else if (seen.current || (live && live.id !== join.spaceId)) onDrop()
  }, [live, join, onDrop])

  if (!join) {
    if (!live) return null
    const listen = async () => {
      setBusy(true)
      setError(null)
      const res = await joinSpace(live.id)
      setBusy(false)
      if (!res.ok) return setError(res.error || 'Could not reach the stage.')
      onJoin(res)
    }
    return (
      <div className={styles.bar}>
        <button type="button" className={styles.listen} disabled={busy} onClick={() => void listen()}>
          <Volume2 size={18} aria-hidden="true" />
          {busy ? 'Connecting…' : 'Tap to hear the stage'}
        </button>
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    )
  }

  return (
    <SpaceLive url={join.livekit.url} token={join.livekit.token} onDisconnected={onDrop}>
      <StageControls spaceId={join.spaceId} join={join} onLeave={onDrop} onSpeaking={onSpeaking} />
    </SpaceLive>
  )
}

function StageControls({
  spaceId,
  join,
  onLeave,
  onSpeaking,
}: {
  spaceId: string
  join: StageJoin
  onLeave: () => void
  onSpeaking: (ids: string[], localId: string | null) => void
}) {
  const live = useLive()
  const [people, setPeople] = useState<SpacePerson[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [handUp, setHandUp] = useState(false)
  const startedMic = useRef(false)

  const me = people.find((p) => p.userId === live.localId)
  const role = me?.role ?? join.role
  const isHost = role === 'host'
  const canSpeak = role === 'host' || role === 'speaker'
  const mic = live.localId ? live.micOn.has(live.localId) : false
  const hands = isHost ? people.filter((p) => p.role === 'listener' && p.askedToSpeak) : []

  // Who's in the Space (roles, raised hands)
  useEffect(() => {
    let stop = false
    const load = async () => {
      const res = await fetchSpace(spaceId)
      if (!stop && res.ok) setPeople(res.people)
    }
    void load()
    const t = window.setInterval(load, 4000)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [spaceId])

  // The host's mic comes on as soon as they're connected at the podium
  useEffect(() => {
    if (!live.connected || startedMic.current || join.role !== 'host') return
    startedMic.current = true
    void live.setMic(true).then((problem) => setNote(problem))
  }, [live, join.role])

  // Tell the hall who is talking (speech marks over their heads)
  const speakingKey = [...live.speaking].sort().join(',')
  useEffect(() => {
    onSpeaking(speakingKey ? speakingKey.split(',') : [], live.localId)
  }, [speakingKey, live.localId, onSpeaking])

  // Mute the stage for yourself: silence every <audio> LiveKit plays
  useEffect(() => {
    document.querySelectorAll('audio').forEach((a) => {
      a.muted = muted
    })
  }, [muted, live.speaking])

  const toggleMic = async () => setNote(await live.setMic(!mic))
  const raise = async () => {
    const res = await requestToSpeak(spaceId)
    if (!res.ok) return setNote(res.error)
    if (res.role === 'listener') {
      setHandUp(true)
      setNote('Hand raised. The host will see it.')
    } else setNote('You can speak now. Tap the mic.')
  }
  const approve = async (p: SpacePerson, yes: boolean) => {
    const res = await approveSpeaker(spaceId, p.userId, yes)
    if (!res.ok) return setNote(res.error)
    setPeople((list) => list.map((x) => (x.userId === p.userId ? { ...x, role: res.role, askedToSpeak: null } : x)))
  }

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <span className={styles.onAir}>
          <span className={styles.dot} aria-hidden="true" />
          {!live.connected ? 'Connecting…' : isHost ? 'You’re on the mic' : canSpeak ? 'You can speak' : 'Listening to the stage'}
        </span>
        {canSpeak ? (
          <button type="button" className={mic ? styles.micOn : styles.round} aria-label={mic ? 'Mute your mic' : 'Unmute your mic'} onClick={() => void toggleMic()}>
            {mic ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
        ) : (
          <button type="button" className={handUp ? styles.micOn : styles.round} aria-label="Raise your hand" disabled={handUp} onClick={() => void raise()}>
            <Hand size={18} />
          </button>
        )}
        <button type="button" className={styles.round} aria-label={muted ? 'Hear the stage' : 'Mute the stage'} onClick={() => setMuted((m) => !m)}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button
          type="button"
          className={styles.leave}
          onClick={() => {
            void leaveSpace(spaceId)
            onLeave()
          }}
        >
          {isHost ? 'End' : 'Leave'}
        </button>
      </div>
      {hands.map((p) => (
        <div key={p.userId} className={styles.hand}>
          <span>✋ @{p.username} wants to speak</span>
          <button type="button" className={styles.yes} onClick={() => void approve(p, true)}>
            Give mic
          </button>
          <button type="button" className={styles.no} onClick={() => void approve(p, false)}>
            No
          </button>
        </div>
      ))}
      {note ? <span className={styles.error}>{note}</span> : null}
    </div>
  )
}

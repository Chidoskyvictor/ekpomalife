'use client'

import { Globe2, Lock, LogOut, Mic, MicOff, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { apiGet, apiPost } from '@/lib/api/client'
import { hapticTap } from './haptic'
import styles from './nearby-mic.module.css'
import { nearbyVoice, useNearbyVoice, type HouseMode, type VoiceFace } from './nearby-voice-store'

const NearbyMicRoom = dynamic(() => import('./nearby-mic-room'), { ssr: false })

const hue = (name: string) => `hsl(${[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 60% 46%)`

/** A row of avatars: everyone on the voice. Shown whenever you're live or joined, never hidden. */
export function VoiceFaces({ faces, max = 5 }: { faces: VoiceFace[]; max?: number }) {
  const shown = faces.slice(0, max)
  const extra = faces.length - shown.length
  return (
    <span className={styles.faces} aria-label={faces.map((f) => `@${f.name}`).join(', ')}>
      {shown.map((f) => (
        <span key={f.id} className={`${styles.face}`} style={{ background: f.color ?? hue(f.name) }} title={`@${f.name}`}>
          {f.emoji || f.name.trim()[0]?.toUpperCase() || '?'}
        </span>
      ))}
      {extra > 0 ? <span className={`${styles.face} ${styles.faceMore}`}>+{extra}</span> : null}
    </span>
  )
}

const MODES: { id: HouseMode; label: string; hint: string }[] = [
  { id: 'open', label: 'Open', hint: 'Anyone inside can join the voice' },
  { id: 'friends', label: 'Friends only', hint: 'Only players you’re close with' },
  { id: 'private', label: 'Private', hint: 'Only people you invite' },
]

/** House owner's voice privacy: Open / Friends only / Private (invite). The server enforces it on every join. */
function HousePrivacy({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<HouseMode>('open')
  const [invited, setInvited] = useState<string[]>([])
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const apply = async (body: Record<string, string>) => {
    const res = await apiPost<{ ok: true; mode: HouseMode; invited: string[] }>('/nearby/house', body)
    if (res.ok) {
      setMode(res.mode)
      setInvited(res.invited)
      setErr(null)
      setName('')
    } else setErr(res.error ?? 'Couldn’t save.')
  }
  useEffect(() => {
    void apiGet<{ ok: true; mode: HouseMode; invited: string[] }>('/nearby/house').then((r) => {
      if (r.ok) {
        setMode(r.mode)
        setInvited(r.invited)
      }
    })
  }, [])
  return (
    <div className={styles.privacy} role="dialog" aria-label="House voice privacy">
      <div className={styles.privacyHead}>
        <strong>Who can join your house voice?</strong>
        <button type="button" className={styles.link} onClick={onClose}>
          Done
        </button>
      </div>
      <div className={styles.modes} role="radiogroup">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`${styles.mode} ${mode === m.id ? styles.modeOn : ''}`} onClick={() => void apply({ mode: m.id })}>
            {m.id === 'open' ? <Globe2 size={15} aria-hidden="true" /> : m.id === 'friends' ? <Users size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
            <span>
              <b>{m.label}</b>
              <small>{m.hint}</small>
            </span>
          </button>
        ))}
      </div>
      {mode === 'private' ? (
        <div className={styles.invites}>
          <form
            className={styles.inviteForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) void apply({ invite: name.trim().replace(/^@/, '') })
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invite @username" maxLength={40} autoCapitalize="none" autoCorrect="off" />
            <button type="submit">Invite</button>
          </form>
          <div className={styles.chips}>
            {invited.map((u) => (
              <button key={u} type="button" className={styles.chip} onClick={() => void apply({ uninvite: u })} aria-label={`Remove @${u}`}>
                @{u} ✕
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {err ? <p className={styles.err}>{err}</p> : null}
    </div>
  )
}

/**
 * Voice in the place you're in. Being here connects you to nobody: the pill shows who's live and a
 * Join button; only Join asks the server for a token. Once joined you always see who is on the voice
 * (avatars), your mic button and Leave. House owners get a privacy switch; visitors the owner shut out
 * see why instead of Join.
 */
export function NearbyMic({
  tone = 'light',
  className,
  badgeClassName,
  popClassName,
}: {
  tone?: 'light' | 'night'
  /** Round button for the drive HUD instead of the pill */
  className?: string
  badgeClassName?: string
  /** Place sheets: a round mic button that pops the voice pill above the sheet (this class places it); it closes once you've joined */
  popClassName?: string
}) {
  const { state, notifyToast } = useGame()
  const place = state?.locationId ?? null
  const path = usePathname()
  // Inside someone else's house (/room/<name>) the voice is theirs, if they let you in
  const home = path?.startsWith('/room/') ? decodeURIComponent(path.split('/')[2] ?? '') || undefined : undefined
  const v = useNearbyVoice()
  const [privacy, setPrivacy] = useState(false)
  const [pop, setPop] = useState(false)
  const joined = Boolean(v.seat)
  // Joining closes the pop-up: the mic button then shows you're on
  useEffect(() => {
    if (joined) setPop(false)
  }, [joined])

  useEffect(() => {
    nearbyVoice.shownChange(1)
    return () => nearbyVoice.shownChange(-1)
  }, [])

  // Who is live here (every 15s and when you move), until you join
  useEffect(() => {
    if (!place || v.seat) return
    void nearbyVoice.refreshCount(home)
    const t = window.setInterval(() => void nearbyVoice.refreshCount(home), 15000)
    return () => window.clearInterval(t)
  }, [place, home, v.seat])

  if (!place || !v.available) return null

  const inRoom = Boolean(v.seat)
  const faces = inRoom ? v.members : v.people
  const live = inRoom ? v.others + 1 : v.count
  const err = (text: string) => notifyToast(text, false)
  if (className && popClassName) {
    const badge = inRoom ? v.others + 1 : v.count
    return (
      <>
        <button
          type="button"
          className={`${className} ${inRoom ? styles.roundOn : ''} ${inRoom && v.micOn ? styles.micOn : ''}`}
          aria-label={inRoom ? 'Voice: mute or leave' : live ? `Voice: ${live} talking, join` : 'Voice here'}
          aria-expanded={pop}
          title="Voice"
          onClick={() => {
            hapticTap()
            setPop((o) => !o)
          }}
        >
          {inRoom && !v.micOn ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          {badge ? <span className={badgeClassName}>{badge > 9 ? '9+' : badge}</span> : null}
        </button>
        {pop ? <div className={popClassName}>{pill()}</div> : null}
      </>
    )
  }
  if (className) {
    const badge = inRoom ? v.others : v.count
    return (
      <button
        type="button"
        className={`${className} ${inRoom && v.micOn ? styles.micOn : ''}`}
        aria-label={inRoom ? (v.micOn ? 'Mute your mic' : 'Unmute your mic') : 'Join voice here'}
        disabled={v.busy || (!inRoom && !v.allowed)}
        onClick={() => {
          hapticTap()
          if (inRoom) void nearbyVoice.toggleMic()
          else void nearbyVoice.join(err, home)
        }}
      >
        {inRoom && v.micOn ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
        {badge ? <span className={badgeClassName}>{badge > 9 ? '9+' : badge}</span> : null}
      </button>
    )
  }
  return pill()

  function pill() {
  const cls = `${styles.pill} ${tone === 'night' ? styles.night : ''} ${inRoom ? styles.joined : ''}`
  return (
    <div className={styles.wrap}>
      <div className={cls} role="group" aria-label="Voice here">
        <span className={styles.live}>
          <span className={styles.dot} aria-hidden="true" />
          {inRoom ? 'You’re on' : live ? 'Live' : 'Voice'}
        </span>
        {faces.length ? <VoiceFaces faces={faces} /> : null}
        <span className={styles.text}>
          {inRoom ? (v.talking ? `🔊 @${v.talking}${v.talkingMore ? ` +${v.talkingMore}` : ''}` : `${live} here`) : !v.allowed ? v.reason : live ? `${live} talking` : 'Nobody yet'}
        </span>
        <span className={styles.actions}>
          {v.isOwner && !inRoom ? (
            <button type="button" className={styles.icon} aria-label="House voice privacy" aria-expanded={privacy} onClick={() => setPrivacy((o) => !o)}>
              {v.mode === 'private' ? <Lock size={15} aria-hidden="true" /> : v.mode === 'friends' ? <Users size={15} aria-hidden="true" /> : <Globe2 size={15} aria-hidden="true" />}
            </button>
          ) : null}
          {inRoom ? (
            <>
              <button
                type="button"
                className={`${styles.icon} ${v.micOn ? styles.micOn : ''}`}
                aria-pressed={v.micOn}
                aria-label={v.micOn ? 'Mute your mic' : 'Unmute your mic'}
                onClick={() => {
                  hapticTap()
                  void nearbyVoice.toggleMic()
                }}
              >
                {v.micOn ? <Mic size={16} aria-hidden="true" /> : <MicOff size={16} aria-hidden="true" />}
              </button>
              <button type="button" className={styles.leave} aria-label="Leave voice" onClick={() => nearbyVoice.leave()}>
                <LogOut size={14} aria-hidden="true" /> Leave
              </button>
            </>
          ) : v.allowed ? (
            <button
              type="button"
              className={styles.join}
              disabled={v.busy}
              onClick={() => {
                hapticTap()
                void nearbyVoice.join(err, home)
              }}
            >
              Join
            </button>
          ) : null}
        </span>
      </div>
      {privacy && v.isOwner && !inRoom ? <HousePrivacy onClose={() => setPrivacy(false)} /> : null}
    </div>
  )
  }
}

/** Always mounted with the HUD: holds the voice room so the call survives the sheet re-rendering. */
export function NearbyVoiceHost() {
  const { state, notifyToast } = useGame()
  const place = state?.locationId ?? null
  const { seat } = useNearbyVoice()

  // Moving somewhere else leaves this place's voice
  useEffect(() => {
    if (seat && place && seat.place !== place && !seat.home) nearbyVoice.leave()
  }, [place, seat])

  if (!seat) return null
  return <NearbyMicRoom key={seat.token} url={seat.url} token={seat.token} onError={(text) => notifyToast(text, false)} onLeave={() => nearbyVoice.leave()} />
}

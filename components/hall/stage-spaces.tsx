'use client'

import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { PlaceAction, PlaceActions } from '@/components/hud/place-sheet'
import { createSpace, fetchSpaces, isJoin, joinSpace, type SpaceCard, type SpaceJoin } from '@/lib/game/spaces-api'
import styles from './stage-spaces.module.css'

/*
 * Spaces on a hall's stage (Student Conference). A Space hosted here is a normal Space in the phone's
 * Spaces app, tagged to this place: the host walks up to the podium, goes live, and the hall's screen
 * shows it. Anyone in the hall (or anywhere, from the app) can join.
 */

const POLL_MS = 15_000

/** The Space live on this stage right now (polled while you're inside). */
export function useStageSpace(placeId: string, enabled: boolean) {
  const [live, setLive] = useState<SpaceCard | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let stop = false
    const load = async () => {
      const res = await fetchSpaces('here', placeId)
      if (stop || !res.ok) return
      setLive(res.spaces.find((s) => s.status === 'live') ?? null)
    }
    void load()
    const t = window.setInterval(load, POLL_MS)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [placeId, enabled, tick])
  return { live, refresh: () => setTick((n) => n + 1) }
}

/** Go live: create the Space here and join it as host (the hall's speakers carry your voice). */
export async function goLiveHere(placeId: string, title: string): Promise<{ ok: true; join: SpaceJoin } | { ok: false; error: string }> {
  const res = await createSpace({ title, placeId, visibility: 'public', askToSpeak: true })
  if (!res.ok) return { ok: false, error: res.error || 'Could not start your Space.' }
  if (isJoin(res)) return { ok: true, join: res }
  const joined = await joinSpace(res.space.id)
  return joined.ok ? { ok: true, join: joined } : { ok: false, error: joined.error || 'Could not start your Space.' }
}

/** The sheet's stage panel: join the live Space, or write a title and host one. */
export function StagePanel({
  live,
  inside,
  busy,
  hearing,
  onHost,
  onListen,
}: {
  live: SpaceCard | null
  inside: boolean
  busy: boolean
  /** Already connected to the stage's sound */
  hearing: boolean
  onHost: (title: string) => void
  onListen: () => void
}) {
  const [title, setTitle] = useState('')
  const clean = title.trim()

  if (live) {
    const mine = live.mine
    return (
      <PlaceActions>
        <div className={styles.live}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.liveText}>
            <strong>{live.title}</strong>
            <span>
              Hosted by @{live.host.username} · {live.present.toLocaleString()} listening
            </span>
          </span>
        </div>
        {hearing ? null : (
          <PlaceAction
            emoji={mine ? '🎙️' : '🔊'}
            title={mine ? 'Back on the mic' : 'Hear the stage'}
            price="Free"
            note={mine ? 'Reconnect your mic at the podium.' : 'Hear the talk in the hall, raise your hand to speak.'}
            disabled={!inside}
            onClick={onListen}
          />
        )}
        {!mine ? <p className={styles.note}>The stage is busy. Host your own once this one ends.</p> : null}
      </PlaceActions>
    )
  }

  return (
    <PlaceActions>
      <div className={styles.host}>
        <label className={styles.label} htmlFor="stage-title">
          🎤 Host a Space on the stage
        </label>
        <input
          id="stage-title"
          className={styles.input}
          value={title}
          maxLength={80}
          placeholder="What's the talk about?"
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="go"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && clean.length >= 3 && inside && !busy) onHost(clean)
          }}
        />
        <button type="button" className={styles.go} disabled={!inside || busy || clean.length < 3} onClick={() => onHost(clean)}>
          {busy ? 'Going live…' : 'Walk to the podium & go live'}
        </button>
        <p className={styles.note}>Everyone in the hall hears you. It also shows in the Spaces app, tagged 📍 Student Conference.</p>
      </div>
    </PlaceActions>
  )
}

/** The big screen behind the stage: the live Space's title, or nothing (the hall's own banner shows). */
export function StageScreen({ live, at, size }: { live: SpaceCard | null; at: [number, number, number]; size: [number, number] }) {
  const tex = useMemo(() => {
    if (!live || typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = Math.round((1024 * size[1]) / size[0])
    const g = c.getContext('2d')
    if (!g) return null
    const grad = g.createLinearGradient(0, 0, 0, c.height)
    grad.addColorStop(0, '#14284f')
    grad.addColorStop(1, '#0b1630')
    g.fillStyle = grad
    g.fillRect(0, 0, c.width, c.height)
    // LIVE pill
    g.fillStyle = '#e11d48'
    g.beginPath()
    g.roundRect(40, 28, 150, 52, 26)
    g.fill()
    g.fillStyle = '#fff'
    g.font = '700 32px system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('● LIVE', 62, 55)
    // title (shrinks to fit)
    let px = 72
    g.font = `800 ${px}px system-ui, sans-serif`
    const t = live.title
    while (px > 30 && g.measureText(t).width > c.width - 80) {
      px -= 4
      g.font = `800 ${px}px system-ui, sans-serif`
    }
    g.textAlign = 'center'
    g.fillText(t, c.width / 2, c.height * 0.55)
    g.font = '500 30px system-ui, sans-serif'
    g.fillStyle = '#c7d6f5'
    g.fillText(`@${live.host.username} · ${live.present} listening · Spaces`, c.width / 2, c.height * 0.84)
    const tx = new CanvasTexture(c)
    tx.colorSpace = SRGBColorSpace
    return tx
  }, [live, size])
  useEffect(() => () => tex?.dispose(), [tex])
  if (!tex) return null
  return (
    <mesh position={at}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

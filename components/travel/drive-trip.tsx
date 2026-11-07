'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { type Trip, tripShown } from '@/lib/game/trip'
import type { DriveMode, DriveView } from './drive-scene'
import { TripMap, tripProgress, useTripClock, VEHICLE } from './trip-map'
import styles from './drive-trip.module.css'

const DriveCanvas = dynamic(() => import('./drive-canvas').then((m) => m.DriveCanvas), { ssr: false })

const VIEWS: { id: DriveView; label: string }[] = [
  { id: 'chase', label: 'Chase' },
  { id: 'side', label: 'Side' },
  { id: 'inside', label: 'Inside' },
]

/** A two-tone horn, made on the spot so there is no sound file to ship. */
function useHorn() {
  const ctx = useRef<AudioContext | null>(null)
  return () => {
    try {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx.current ??= new Audio()
      const audio = ctx.current
      void audio.resume()
      const now = audio.currentTime
      const gain = audio.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
      gain.connect(audio.destination)
      for (const freq of [420, 520]) {
        const osc = audio.createOscillator()
        osc.type = 'square'
        osc.frequency.value = freq
        osc.connect(gain)
        osc.start(now)
        osc.stop(now + 0.42)
      }
    } catch {
      /* no audio available */
    }
  }
}

/**
 * The ride to a place: a looping highway drive with a camera switch, Horn and Map. It stays
 * up until the server has moved you and the next scene is ready, same as the plain trip card.
 */
export function DriveTrip({ trip }: { trip: Trip }) {
  const mode: DriveMode = trip.mode === 'okada' ? 'okada' : 'keke'
  const [view, setView] = useState<DriveView>('chase')
  const [showMap, setShowMap] = useState(false)
  const horn = useHorn()
  // How long the ride was planned for (Skip shortens minMs, but the gate keeps its place)
  const plannedMs = useRef(trip.minMs).current
  const now = useTripClock(trip, 200)

  const progress = tripProgress(trip, now)
  const pct = Math.round(progress * 100)
  const left = Math.max(0, Math.ceil((trip.startedAt + trip.minMs - now) / 1000))
  const waiting = progress >= 0.9 && !trip.ready && trip.minMs <= now - trip.startedAt

  return (
    <div className={styles.drive} data-done={trip.done} role="status" aria-live="polite">
      <div className={styles.canvas} aria-hidden="true">
        <DriveCanvas mode={mode} view={view} route={trip.route} plannedMs={plannedMs} appearance={trip.appearance} onShown={() => tripShown(trip.id)} />
      </div>

      <div className={styles.glass}>
        <span className={styles.glassIcon} aria-hidden="true">{VEHICLE[trip.mode]}</span>
        <span className={styles.glassTo}>{trip.label}</span>
        <span className={styles.glassTime}>
          {waiting ? '…' : pct >= 100 ? 'Here' : `0:${String(left).padStart(2, '0')}`}
        </span>
        <span className={styles.glassBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </span>
      </div>
      {mode === 'okada' && trip.route === 'in' ? (
        <p className={styles.note}>Okada drops you at the gate</p>
      ) : null}

      {showMap ? (
        <div className={styles.map}>
          <TripMap trip={trip} progress={progress} />
        </div>
      ) : null}

      <div className={styles.round}>
        <button
          type="button"
          className={styles.roundBtn}
          aria-label={`Camera: ${VIEWS.find((v) => v.id === view)?.label}. Tap to switch`}
          onClick={() => {
            const i = VIEWS.findIndex((v) => v.id === view)
            setView(VIEWS[(i + 1) % VIEWS.length]!.id)
          }}
        >
          🎥
        </button>
        <button
          type="button"
          className={styles.roundBtn}
          aria-label="Horn"
          onClick={() => {
            hapticTap()
            horn()
          }}
        >
          📣
        </button>
        <button type="button" className={styles.roundBtn} aria-label="Map" aria-pressed={showMap} onClick={() => setShowMap((on) => !on)}>
          🗺️
        </button>
      </div>
    </div>
  )
}

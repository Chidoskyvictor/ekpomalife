'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { skipTrip, type Trip } from '@/lib/game/trip'
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
 * The ride to a place: a looping highway drive with a camera switch, Horn, Map and Skip. It stays
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
        <DriveCanvas mode={mode} view={view} route={trip.route} plannedMs={plannedMs} />
      </div>

      <div className={styles.top}>
        <div className={styles.card}>
          <p className={styles.title}>
            <span aria-hidden="true">{VEHICLE[trip.mode]}</span> On the way to {trip.label}…
          </p>
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span className={styles.fill} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.eta}>
            {waiting ? 'Almost there…' : pct >= 100 ? 'Arrived' : `About 0:${String(left).padStart(2, '0')} to go`}
          </p>
          {mode === 'okada' && trip.route === 'in' ? (
            <p className={styles.eta}>Okada can’t go into campus. It drops you at the gate.</p>
          ) : null}
        </div>
        <div className={styles.views} role="radiogroup" aria-label="Camera">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={view === item.id}
              className={styles.view}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {showMap ? (
        <div className={styles.map}>
          <TripMap trip={trip} progress={progress} />
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            hapticTap()
            horn()
          }}
        >
          📣 Horn
        </button>
        <button type="button" className={styles.action} aria-pressed={showMap} onClick={() => setShowMap((on) => !on)}>
          🗺️ Map
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.skip}`}
          onClick={() => {
            // Cut the timer short; the trip layer still waits for the server and the next scene
            skipTrip(trip.id)
          }}
        >
          ⏭ Skip
        </button>
      </div>
    </div>
  )
}

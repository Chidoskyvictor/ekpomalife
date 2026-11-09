'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { Eye, EyeOff, Map as MapIcon, Megaphone, SkipForward, Video } from 'lucide-react'
import { skipTrip, type Trip, tripShown } from '@/lib/game/trip'
import type { DriveMode, DriveView } from './drive-scene'
import { TripMap, tripProgress, useTripClock, VEHICLE } from './trip-map'
import styles from './drive-trip.module.css'

const DriveCanvas = dynamic(() => import('./drive-canvas').then((m) => m.DriveCanvas), { ssr: false })

const MODE_LABEL = { trek: 'Walking', keke: 'Keke', okada: 'Okada' } as const

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

/** Play a one-off sound, then fade it out over `fadeMs` after `holdMs`. */
function playFading(src: string, volume: number, holdMs: number, fadeMs: number) {
  const audio = new Audio(src)
  audio.volume = volume
  void audio.play().catch(() => {})
  const start = performance.now() + holdMs
  const timer = window.setInterval(() => {
    const t = (performance.now() - start) / fadeMs
    if (t < 0) return
    audio.volume = Math.max(0, volume * (1 - t))
    if (t >= 1) {
      audio.pause()
      window.clearInterval(timer)
    }
  }, 60)
  return () => {
    window.clearInterval(timer)
    audio.pause()
  }
}

/** Road sound looping under the whole ride, plus the start sound when the ride begins and again as it ends. */
function useRideSounds(nearEnd: boolean) {
  useEffect(() => {
    const road = new Audio('/audio/ride/traffic.mp3')
    road.loop = true
    road.volume = 0.35
    void road.play().catch(() => {})
    const stopStart = playFading('/audio/ride/start.mp3', 0.7, 1200, 1800)
    return () => {
      road.pause()
      stopStart()
    }
  }, [])
  useEffect(() => {
    if (!nearEnd) return
    return playFading('/audio/ride/start.mp3', 0.7, 1200, 1800)
  }, [nearEnd])
}

/**
 * The ride to a place: a looping highway drive with a camera switch, Horn and Map. It stays
 * up until the server has moved you and the next scene is ready, same as the plain trip card.
 */
export function DriveTrip({ trip }: { trip: Trip }) {
  const mode: DriveMode = trip.mode === 'okada' ? 'okada' : 'keke'
  const [view, setView] = useState<DriveView>('chase')
  const [showMap, setShowMap] = useState(false)
  // Clean view: only a small eye button stays
  const [hidden, setHidden] = useState(false)
  const horn = useHorn()
  // How long the ride was planned for (Skip shortens minMs, but the gate keeps its place)
  const plannedMs = useRef(trip.minMs).current
  const now = useTripClock(trip, 200)

  const progress = tripProgress(trip, now)
  const pct = Math.round(progress * 100)
  const left = Math.max(0, Math.ceil((trip.startedAt + trip.minMs - now) / 1000))
  useRideSounds(progress >= 0.9)
  const waiting = progress >= 0.9 && !trip.ready && trip.minMs <= now - trip.startedAt

  const skipped = trip.minMs === 0
  const timeText = waiting || skipped ? 'Arriving…' : pct >= 100 ? 'Here' : `0:${String(left).padStart(2, '0')} left`
  const viewLabel = VIEWS.find((v) => v.id === view)!.label

  return (
    <div className={styles.drive} data-done={trip.done} role="status" aria-live="polite">
      <div className={styles.canvas} aria-hidden="true">
        <DriveCanvas mode={mode} view={view} route={trip.route} plannedMs={plannedMs} appearance={trip.appearance} onShown={() => tripShown(trip.id)} />
      </div>

      <div className={styles.hud} data-hidden={hidden}>
        <div className={styles.hudBar}>
          <span className={styles.barIcon} aria-hidden="true">
            {VEHICLE[trip.mode]}
          </span>
          <div className={styles.barText}>
            <strong className={styles.barTo}>{trip.label}</strong>
            <span className={styles.barMeta}>
              {MODE_LABEL[trip.mode]} · {timeText}
            </span>
          </div>
          <button
            type="button"
            className={styles.skipBtn}
            disabled={skipped || trip.done}
            onClick={() => {
              hapticTap()
              skipTrip(trip.id)
            }}
          >
            <SkipForward size={15} aria-hidden="true" />
            Skip
          </button>
          <span className={styles.barLine} role="progressbar" aria-label="Trip progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
        {mode === 'okada' && trip.route === 'in' ? <p className={styles.note}>Okada drops you at the gate</p> : null}

        {showMap ? (
          <div className={styles.map}>
            <TripMap trip={trip} progress={progress} />
          </div>
        ) : null}
      </div>

      <div className={styles.dock}>
        {hidden ? null : (
          <>
            <button
              type="button"
              className={styles.dockBtn}
              aria-label={`Camera: ${viewLabel}. Tap to switch`}
              onClick={() => {
                const i = VIEWS.findIndex((v) => v.id === view)
                setView(VIEWS[(i + 1) % VIEWS.length]!.id)
              }}
            >
              <Video size={18} aria-hidden="true" />
              <span>{viewLabel}</span>
            </button>
            <button
              type="button"
              className={styles.dockBtn}
              aria-label="Horn"
              onClick={() => {
                hapticTap()
                horn()
              }}
            >
              <Megaphone size={18} aria-hidden="true" />
            </button>
            <button type="button" className={styles.dockBtn} aria-label="Map" aria-pressed={showMap} onClick={() => setShowMap((on) => !on)}>
              <MapIcon size={18} aria-hidden="true" />
            </button>
          </>
        )}
        <button
          type="button"
          className={`${styles.dockBtn} ${hidden ? styles.dockQuiet : ''}`}
          aria-label={hidden ? 'Show ride controls' : 'Hide ride controls'}
          aria-pressed={hidden}
          onClick={() => setHidden((h) => !h)}
        >
          {hidden ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

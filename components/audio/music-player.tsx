'use client'

import { useEffect, useRef } from 'react'
import { MUSIC_TRACKS, musicSignedIn, SOUND_EVENT, soundMuted, useMusicSettings } from '@/lib/audio/music'
import { useTrip } from '@/lib/game/trip'

/** Music drops to this share of its volume during a ride, so the horn and the road come through. */
const RIDE_DUCK = 0.35

/**
 * Background music for the whole game. Mounted once in the root layout, so it keeps playing
 * across the map, rooms, halls and trips. Browsers only allow sound after a tap, so it starts on
 * the first one. Pauses while the app is in the background.
 */
export function MusicPlayer() {
  const settings = useMusicSettings()
  const trip = useTrip()
  const audio = useRef<HTMLAudioElement | null>(null)
  const index = useRef(0)
  const missing = useRef(new Set<number>())
  const unlocked = useRef(false)

  const wanted = useRef<() => boolean>(() => false)
  wanted.current = () => musicSignedIn() && settings.on && settings.volume > 0 && !soundMuted() && missing.current.size < MUSIC_TRACKS.length

  // One <audio> for the whole visit; skips files that aren't there and moves to the next song
  useEffect(() => {
    const el = new Audio()
    el.preload = 'auto'
    audio.current = el
    const next = () => {
      for (let step = 1; step <= MUSIC_TRACKS.length; step++) {
        const i = (index.current + step) % MUSIC_TRACKS.length
        if (!missing.current.has(i)) {
          index.current = i
          el.src = MUSIC_TRACKS[i]!
          if (unlocked.current && wanted.current()) void el.play().catch(() => {})
          return
        }
      }
    }
    const onError = () => {
      missing.current.add(index.current)
      if (missing.current.size < MUSIC_TRACKS.length) next()
    }
    el.addEventListener('ended', next)
    el.addEventListener('error', onError)
    el.src = MUSIC_TRACKS[0]!
    return () => {
      el.removeEventListener('ended', next)
      el.removeEventListener('error', onError)
      el.pause()
      el.removeAttribute('src')
      audio.current = null
    }
  }, [])

  // Start on the first tap or key press (browser autoplay rules)
  useEffect(() => {
    const unlock = () => {
      unlocked.current = true
      const el = audio.current
      if (el && wanted.current()) void el.play().catch(() => {})
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Volume, on/off, the Sound switch, and quieter during rides
  const riding = Boolean(trip?.drive)
  useEffect(() => {
    const apply = () => {
      const el = audio.current
      if (!el) return
      el.volume = Math.min(1, settings.volume * (riding ? RIDE_DUCK : 1))
      if (!wanted.current() || document.hidden) el.pause()
      else if (unlocked.current && el.paused) void el.play().catch(() => {})
    }
    apply()
    window.addEventListener(SOUND_EVENT, apply)
    document.addEventListener('visibilitychange', apply)
    return () => {
      window.removeEventListener(SOUND_EVENT, apply)
      document.removeEventListener('visibilitychange', apply)
    }
  }, [settings.on, settings.volume, riding])

  return null
}

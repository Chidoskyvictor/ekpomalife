'use client'

import { useEffect, useRef } from 'react'
import { musicSignedIn, setClubMusic, SOUND_EVENT, soundMuted, useMusicSettings } from '@/lib/audio/music'

/**
 * Club set (Sazza and Forbes). Each track plays through, then the next, then the set repeats.
 * Order: the original club song, then the two tracks the owner added (2026-11-10).
 */
const CLUB_SET = ['/audio/club/club-night.mp3', '/audio/club/club-set-2.mp3', '/audio/club/club-set-3.m4a']
/** Fired on a spray: the song dips for a moment so the DJ's air horn cuts through. */
export const CLUB_DUCK_EVENT = 'ekpoma-club-duck'
const DUCK_LEVEL = 0.25
const DUCK_MS = 2500

/**
 * Plays the club set while you're inside, instead of the game's background music (which pauses and
 * comes back when you leave). One track finishes, then the next starts, and the set repeats. Follows
 * the Music on/off, volume and Sound settings, goes quiet while the app is hidden, and steps aside
 * while a promoted song from the LED screen is playing.
 */
export function ClubMusic() {
  const settings = useMusicSettings()
  const audio = useRef<HTMLAudioElement | null>(null)
  const otherPlaying = useRef(false)
  const ducked = useRef(false)
  // Read the latest settings without rebuilding the player (rebuilding would restart the song)
  const current = useRef(settings)
  current.current = settings

  useEffect(() => {
    const el = new Audio()
    el.loop = false
    el.preload = 'auto'
    audio.current = el
    setClubMusic(true)
    let index = 0

    const wanted = () =>
      musicSignedIn() && current.current.on && current.current.volume > 0 && !soundMuted() && !otherPlaying.current && document.visibilityState === 'visible'

    const apply = () => {
      el.volume = Math.min(1, current.current.volume) * (ducked.current ? DUCK_LEVEL : 1)
      if (wanted()) void el.play().catch(() => {})
      else el.pause()
    }

    const load = (next: number) => {
      index = next % CLUB_SET.length
      el.src = CLUB_SET[index]!
      apply()
    }

    // Browsers only allow sound after a tap: if it couldn't start yet, the next tap starts it
    const tap = () => apply()
    // Another song (the LED screen's Play) takes over; ours comes back when it pauses or ends
    const onOtherPlay = (e: Event) => {
      if (e.target === el || !(e.target instanceof HTMLAudioElement)) return
      otherPlaying.current = true
      apply()
    }
    const onOtherStop = (e: Event) => {
      if (e.target === el || !(e.target instanceof HTMLAudioElement)) return
      otherPlaying.current = false
      apply()
    }

    let duckTimer = 0
    const duck = () => {
      ducked.current = true
      apply()
      window.clearTimeout(duckTimer)
      duckTimer = window.setTimeout(() => {
        ducked.current = false
        apply()
      }, DUCK_MS)
    }

    let skips = 0
    const onEnded = () => {
      skips = 0
      load(index + 1)
    }
    // A track that fails to load is skipped. Code 1 is an abort from changing src, not a bad file.
    // Stop after one full cycle of failures so a missing file cannot spin the player.
    const onError = () => {
      if (!el.error || el.error.code === 1) return
      skips += 1
      if (skips >= CLUB_SET.length) return
      load(index + 1)
    }

    load(0)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)
    window.addEventListener(CLUB_DUCK_EVENT, duck)
    window.addEventListener('pointerdown', tap)
    window.addEventListener(SOUND_EVENT, apply)
    document.addEventListener('visibilitychange', apply)
    document.addEventListener('play', onOtherPlay, true)
    document.addEventListener('pause', onOtherStop, true)
    document.addEventListener('ended', onOtherStop, true)
    return () => {
      window.clearTimeout(duckTimer)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
      window.removeEventListener(CLUB_DUCK_EVENT, duck)
      window.removeEventListener('pointerdown', tap)
      window.removeEventListener(SOUND_EVENT, apply)
      document.removeEventListener('visibilitychange', apply)
      document.removeEventListener('play', onOtherPlay, true)
      document.removeEventListener('pause', onOtherStop, true)
      document.removeEventListener('ended', onOtherStop, true)
      el.pause()
      el.removeAttribute('src')
      el.load()
      audio.current = null
      setClubMusic(false)
    }
  }, [])

  return null
}

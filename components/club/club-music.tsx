'use client'

import { useEffect, useRef } from 'react'
import { musicSignedIn, setClubMusic, SOUND_EVENT, soundMuted, useMusicSettings } from '@/lib/audio/music'

/** The club's own song (Sazza and Forbes), looping. The owner picked this track for the clubs. */
const CLUB_SONG = '/audio/club/club-night.mp3'
/** Fired on a spray: the song dips for a moment so the DJ's air horn cuts through. */
export const CLUB_DUCK_EVENT = 'ekpoma-club-duck'
const DUCK_LEVEL = 0.25
const DUCK_MS = 2500

/**
 * Plays the club song while you're inside, instead of the game's background music (which pauses and
 * comes back when you leave). Follows the Music on/off, volume and Sound settings, goes quiet while the
 * app is hidden, and steps aside while a promoted song from the LED screen is playing.
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
    const el = new Audio(CLUB_SONG)
    el.loop = true
    el.preload = 'auto'
    audio.current = el
    setClubMusic(true)

    const wanted = () =>
      musicSignedIn() && current.current.on && current.current.volume > 0 && !soundMuted() && !otherPlaying.current && document.visibilityState === 'visible'

    const apply = () => {
      el.volume = Math.min(1, current.current.volume) * (ducked.current ? DUCK_LEVEL : 1)
      if (wanted()) void el.play().catch(() => {})
      else el.pause()
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

    apply()
    window.addEventListener(CLUB_DUCK_EVENT, duck)
    window.addEventListener('pointerdown', tap)
    window.addEventListener(SOUND_EVENT, apply)
    document.addEventListener('visibilitychange', apply)
    document.addEventListener('play', onOtherPlay, true)
    document.addEventListener('pause', onOtherStop, true)
    document.addEventListener('ended', onOtherStop, true)
    return () => {
      window.clearTimeout(duckTimer)
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

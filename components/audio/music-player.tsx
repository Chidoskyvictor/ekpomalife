'use client'

import { useEffect, useRef } from 'react'
import { clubMusicOn, MUSIC_TRACKS, musicSignedIn, SOUND_EVENT, soundMuted, useMusicSettings } from '@/lib/audio/music'
import { useTrip } from '@/lib/game/trip'

/** Music drops to this share of its volume during a ride, so the horn and the road come through. */
const RIDE_DUCK = 0.35

/*
 * Game sound plays through the Web Audio API (AudioContext + AudioBufferSourceNode), never an
 * <audio> / new Audio() element. Android Chrome puts a media-player notification on the lock
 * screen for any audio ELEMENT that plays more than a few seconds; Web Audio doesn't get one.
 * Only a future, deliberate in-game radio or music player may use HTMLAudioElement and
 * navigator.mediaSession (so it shows up on the lock screen on purpose). Nothing else should.
 */

type Ctx = AudioContext

function makeContext(): Ctx | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return AC ? new AC() : null
}

/** A track decoded: the .ogg next to it when there is one and the browser decodes it, else the .mp3. */
async function loadTrack(audio: Ctx, url: string): Promise<AudioBuffer | null> {
  for (const src of [url.replace(/\.mp3$/, '.ogg'), url]) {
    try {
      const res = await fetch(src)
      if (!res.ok) continue
      return await audio.decodeAudioData(await res.arrayBuffer())
    } catch {
      /* missing or not decodable here: try the next one */
    }
  }
  return null
}

/**
 * Background music for the whole game. Mounted once in the root layout, so it keeps playing
 * across the map, rooms, halls and trips. Browsers only allow sound after a tap, so nothing is
 * loaded or played until the first one. Only the playing track is kept in memory (decoded audio is
 * large), and the audio pauses while the app is in the background.
 */
export function MusicPlayer() {
  const settings = useMusicSettings()
  const trip = useTrip()
  const ctx = useRef<Ctx | null>(null)
  const gain = useRef<GainNode | null>(null)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const index = useRef(0)
  const missing = useRef(new Set<number>())
  const loading = useRef(false)

  const wanted = useRef<() => boolean>(() => false)
  wanted.current = () => !clubMusicOn() && musicSignedIn() && settings.on && settings.volume > 0 && !soundMuted() && missing.current.size < MUSIC_TRACKS.length

  /** Stop and drop the current track (its decoded buffer goes with it). */
  const stopTrack = () => {
    const src = source.current
    source.current = null
    if (!src) return
    src.onended = null
    try {
      src.stop()
    } catch {
      /* already stopped */
    }
    src.disconnect()
  }

  /** Load the track at `index` (or the next one that exists) and play it; on its end, the next. */
  const playCurrent = async () => {
    const audio = ctx.current
    const out = gain.current
    if (!audio || !out || loading.current || source.current) return
    loading.current = true
    try {
      for (let step = 0; step < MUSIC_TRACKS.length; step++) {
        const i = (index.current + step) % MUSIC_TRACKS.length
        if (missing.current.has(i)) continue
        const buffer = await loadTrack(audio, MUSIC_TRACKS[i]!)
        if (!buffer) {
          missing.current.add(i)
          continue
        }
        if (!wanted.current() || source.current) return
        index.current = i
        const src = audio.createBufferSource()
        src.buffer = buffer
        src.connect(out)
        src.onended = () => {
          // Played to the end: the next track (the stop() above clears this first, so it's not a stop)
          if (source.current !== src) return
          source.current = null
          src.disconnect()
          index.current = (i + 1) % MUSIC_TRACKS.length
          void playCurrent()
        }
        source.current = src
        src.start()
        return
      }
    } finally {
      loading.current = false
    }
  }

  /** Volume, on/off, the Sound switch, quieter during rides, and silent while the app is hidden. */
  const riding = Boolean(trip?.drive)
  const apply = useRef<() => void>(() => {})
  apply.current = () => {
    const audio = ctx.current
    if (!audio || !gain.current) return
    gain.current.gain.setTargetAtTime(Math.min(1, settings.volume * (riding ? RIDE_DUCK : 1)), audio.currentTime, 0.05)
    if (document.visibilityState === 'hidden') {
      void audio.suspend().catch(() => {})
      return
    }
    void audio.resume().catch(() => {})
    if (!wanted.current()) stopTrack()
    else if (!source.current) void playCurrent()
  }

  // Start on the first tap or key press (browser autoplay rules, and iOS needs the context made/resumed in a tap)
  useEffect(() => {
    const unlock = () => {
      if (!ctx.current) {
        const audio = makeContext()
        if (!audio) return
        const out = audio.createGain()
        out.connect(audio.destination)
        ctx.current = audio
        gain.current = out
      }
      apply.current()
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

  useEffect(() => {
    const run = () => apply.current()
    run()
    window.addEventListener(SOUND_EVENT, run)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.removeEventListener(SOUND_EVENT, run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [settings.on, settings.volume, riding])

  // Leaving the page entirely: stop and close the audio context
  useEffect(
    () => () => {
      stopTrack()
      void ctx.current?.close().catch(() => {})
      ctx.current = null
      gain.current = null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on unmount
    [],
  )

  return null
}

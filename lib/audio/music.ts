import { useSyncExternalStore } from 'react'

/*
 * In-game background music. Drop the songs in public/audio/music/:
 *   theme.mp3 (required), theme-2.mp3, theme-3.mp3 … (optional, played in turn)
 * MP3 around 128 kbps, made to loop cleanly. Missing files are skipped quietly.
 */
export const MUSIC_TRACKS = [
  '/audio/music/theme.mp3',
  '/audio/music/theme-2.mp3',
  '/audio/music/theme-3.mp3',
  '/audio/music/theme-4.mp3',
]

export type MusicSettings = { on: boolean; volume: number }

const KEY = 'ekpoma-life-music'
const MUTED_KEY = 'ekpoma-life-muted'
/** Fired when Sound or Music settings change, so the player picks them up at once. */
export const SOUND_EVENT = 'ekpoma-sound-change'

const DEFAULTS: MusicSettings = { on: true, volume: 0.5 }
let cached: MusicSettings | null = null

function read(): MusicSettings {
  if (cached) return cached
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<MusicSettings>) : {}
    cached = {
      on: parsed.on ?? DEFAULTS.on,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULTS.volume,
    }
  } catch {
    cached = DEFAULTS
  }
  return cached
}

/** The game-wide Sound switch (status bar / settings): off silences the music too. */
export function soundMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

export function setMusic(patch: Partial<MusicSettings>) {
  cached = { ...read(), ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cached))
  } catch {
    /* private mode: keep it for this visit */
  }
  window.dispatchEvent(new Event(SOUND_EVENT))
}

function subscribe(fn: () => void) {
  window.addEventListener(SOUND_EVENT, fn)
  return () => window.removeEventListener(SOUND_EVENT, fn)
}

export function useMusicSettings(): MusicSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS)
}

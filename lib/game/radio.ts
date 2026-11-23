'use client'

import { useSyncExternalStore } from 'react'
import { apiGet } from '@/lib/api/client'

/*
 * In-game radio. One shared player for the whole app, so a station keeps playing across screens
 * (car, buildings, phone). Stations come from our server (`GET /radio/stations`), which holds the
 * Naija Radio key. No UI here: screens call `useRadio()` and the controls below.
 */

export type RadioStation = {
  id: string
  name: string
  streamUrl: string
  logo: string | null
  city: string | null
  genre: string | null
  frequency: string | null
}

/** Where the radio is playing from; later screens use it to fade or muffle (e.g. inside a building). */
export type RadioSource = 'car' | 'building' | 'phone'

type RadioState = {
  stations: RadioStation[]
  loaded: boolean
  error: string | null
  current: RadioStation | null
  playing: boolean
  buffering: boolean
  volume: number
  source: RadioSource | null
}

let state: RadioState = { stations: [], loaded: false, error: null, current: null, playing: false, buffering: false, volume: 0.8, source: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<RadioState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let audio: HTMLAudioElement | null = null
function player(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'none'
    audio.volume = state.volume
    audio.addEventListener('playing', () => set({ playing: true, buffering: false, error: null }))
    audio.addEventListener('waiting', () => set({ buffering: true }))
    audio.addEventListener('pause', () => set({ playing: false, buffering: false }))
    audio.addEventListener('error', () => set({ playing: false, buffering: false, error: 'This station is off air. Try another.' }))
  }
  return audio
}

let loading: Promise<void> | null = null
export function loadStations(force = false): Promise<void> {
  if (state.loaded && !force) return Promise.resolve()
  if (!loading) {
    loading = apiGet<{ ok: true; stations: RadioStation[] }>('/radio/stations')
      .then((res) => {
        if (res.ok) set({ stations: res.stations, loaded: true, error: null })
        else set({ loaded: true, error: res.error ?? 'Radio is unavailable.' })
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
}

const LAST_KEY = 'ekpoma-radio-last'
/** The station this player listened to last (kept on this device), if any. */
export function lastStationId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

/** Must be called from a tap (browsers block audio that wasn't started by the player). */
export async function playStation(station: RadioStation, source: RadioSource = 'phone') {
  const a = player()
  if (state.current?.id !== station.id) a.src = station.streamUrl
  set({ current: station, source, buffering: true, error: null })
  try {
    localStorage.setItem(LAST_KEY, station.id)
  } catch {
    /* private mode: it just won't be remembered */
  }
  try {
    await a.play()
  } catch {
    set({ buffering: false, playing: false, error: 'Tap play again to start the radio.' })
  }
}

export function stopRadio() {
  if (!audio) return
  audio.pause()
  audio.removeAttribute('src') // drop the live stream so it stops downloading
  audio.load()
  set({ playing: false, buffering: false, source: null })
}

export function togglePlay(source?: RadioSource) {
  if (state.playing) stopRadio()
  else if (state.current) void playStation(state.current, source ?? state.source ?? 'phone')
}

/** Next/previous station in the list (car buttons). */
export function stepStation(dir: 1 | -1, source?: RadioSource) {
  const list = state.stations
  if (!list.length) return
  const i = state.current ? list.findIndex((s) => s.id === state.current!.id) : -1
  const next = list[(i + dir + list.length) % list.length]
  void playStation(next, source ?? state.source ?? 'phone')
}

export function setVolume(v: number) {
  const volume = Math.max(0, Math.min(1, v))
  if (audio) audio.volume = volume
  set({ volume })
}

export function useRadio(): RadioState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}

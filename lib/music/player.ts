'use client'

import { useSyncExternalStore } from 'react'
import { clubMusicOn, SOUND_EVENT, soundMuted, setPlayerMusic } from '@/lib/audio/music'
import { fetchTrackStats, likeTrack, postStream, unlikeTrack, type TrackStats } from './music-api'
import { TRACKS, trackById } from './tracks'

/*
 * One player for the whole app: it lives outside React, so the song keeps playing while you browse
 * other phone apps and the Now Playing bar can show it anywhere. A stream counts after 30 seconds
 * actually listened (seeking doesn't count); the server keeps it to one per player per track per hour.
 */
export const STREAM_AFTER_SECONDS = 30

export type PlayerState = { id: string | null; playing: boolean; time: number; duration: number }
export type StatsState = { loaded: boolean; failed: boolean; byId: Record<string, TrackStats> }

let player: PlayerState = { id: null, playing: false, time: 0, duration: 0 }
let stats: StatsState = { loaded: false, failed: false, byId: {} }
const playerSubs = new Set<() => void>()
const statsSubs = new Set<() => void>()
const emitPlayer = () => playerSubs.forEach((f) => f())
const emitStats = () => statsSubs.forEach((f) => f())
const setPlayer = (patch: Partial<PlayerState>) => {
  player = { ...player, ...patch }
  setPlayerMusic(player.playing)
  emitPlayer()
}

let el: HTMLAudioElement | null = null
let listened = 0
let lastTime = 0
let counted = false
let clubWas = false

function volume() {
  try {
    return Math.min(1, Math.max(0, JSON.parse(window.localStorage.getItem('ekpoma-life-music') ?? '{}').volume ?? 0.5))
  } catch {
    return 0.5
  }
}

function audio(): HTMLAudioElement {
  if (el) return el
  el = new Audio()
  el.preload = 'metadata'
  el.addEventListener('timeupdate', () => {
    if (!el) return
    const dt = el.currentTime - lastTime
    // Only normal playback counts as listening: a jump (seek) or a pause adds nothing
    if (!el.paused && dt > 0 && dt < 1.5) listened += dt
    lastTime = el.currentTime
    if (!counted && player.id && listened >= STREAM_AFTER_SECONDS) {
      counted = true
      const id = player.id
      void postStream(id).then((res) => {
        if (res.ok) mergeTrack(res.track)
      })
    }
    setPlayer({ time: el.currentTime })
  })
  el.addEventListener('durationchange', () => el && setPlayer({ duration: Number.isFinite(el.duration) ? el.duration : 0 }))
  el.addEventListener('play', () => setPlayer({ playing: true }))
  el.addEventListener('pause', () => setPlayer({ playing: false }))
  el.addEventListener('ended', () => next(true))
  el.addEventListener('error', () => {
    if (el?.error && el.error.code !== 1) setPlayer({ playing: false })
  })
  // The club takes the speakers when you walk in
  window.addEventListener(SOUND_EVENT, () => {
    const now = clubMusicOn()
    if (now && !clubWas && player.playing) pause()
    clubWas = now
  })
  return el
}

function load(id: string) {
  const track = trackById(id)
  if (!track) return
  const a = audio()
  a.src = track.src
  a.volume = soundMuted() ? 0 : volume()
  listened = 0
  lastTime = 0
  counted = false
  setPlayer({ id, time: 0, duration: 0 })
}

export function playTrack(id: string) {
  const a = audio()
  if (player.id !== id) load(id)
  a.volume = soundMuted() ? 0 : volume()
  void a.play().catch(() => setPlayer({ playing: false }))
}

export function pause() {
  el?.pause()
}

export function toggle(id?: string) {
  if (id && id !== player.id) return playTrack(id)
  if (!player.id) return playTrack(TRACKS[0]!.id)
  if (player.playing) pause()
  else playTrack(player.id)
}

export function seek(seconds: number) {
  if (!el || !player.duration) return
  el.currentTime = Math.min(player.duration, Math.max(0, seconds))
  lastTime = el.currentTime
  setPlayer({ time: el.currentTime })
}

function step(by: number, play: boolean) {
  const i = TRACKS.findIndex((t) => t.id === player.id)
  const to = TRACKS[(i + by + TRACKS.length) % TRACKS.length]!
  load(to.id)
  if (play) playTrack(to.id)
}

/** Next song; after the last one the set starts again. */
export function next(play = true) {
  step(1, play)
}

/** Within the first 3 seconds go to the song before; later, back to the start of this one. */
export function previous() {
  if (el && player.time > 3) return seek(0)
  step(-1, true)
}

export function clearPlayer() {
  el?.pause()
  load(player.id ?? TRACKS[0]!.id)
  setPlayer({ id: null, time: 0, duration: 0, playing: false })
}

const subscribePlayer = (f: () => void) => {
  playerSubs.add(f)
  return () => playerSubs.delete(f)
}
const SERVER: PlayerState = { id: null, playing: false, time: 0, duration: 0 }
export function useMusicPlayer(): PlayerState {
  return useSyncExternalStore(subscribePlayer, () => player, () => SERVER)
}

/** Whether the club (Sazza, Forbes) is playing its own set right now. */
export function useClubPlaying(): boolean {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener(SOUND_EVENT, f)
      return () => window.removeEventListener(SOUND_EVENT, f)
    },
    clubMusicOn,
    () => false,
  )
}

/* —— Streams and hearts from the server —— */
function mergeTrack(t: TrackStats) {
  stats = { ...stats, byId: { ...stats.byId, [t.id]: t } }
  emitStats()
}

export async function loadStats() {
  const res = await fetchTrackStats()
  if (!res.ok) {
    stats = { ...stats, failed: !stats.loaded }
    emitStats()
    return false
  }
  stats = { loaded: true, failed: false, byId: Object.fromEntries(res.tracks.map((t) => [t.id, t])) }
  emitStats()
  return true
}

/** Heart or un-heart: the heart flips at once, and goes back if the server says no. */
export async function toggleLike(id: string) {
  const before = stats.byId[id] ?? { id, streams: 0, likes: 0, liked: false }
  const want = !before.liked
  mergeTrack({ ...before, liked: want, likes: Math.max(0, before.likes + (want ? 1 : -1)) })
  const res = await (want ? likeTrack(id) : unlikeTrack(id))
  if (res.ok) mergeTrack(res.track)
  else mergeTrack(before)
  return res.ok
}

const subscribeStats = (f: () => void) => {
  statsSubs.add(f)
  return () => statsSubs.delete(f)
}
const NO_STATS: StatsState = { loaded: false, failed: false, byId: {} }
export function useTrackStats(): StatsState {
  return useSyncExternalStore(subscribeStats, () => stats, () => NO_STATS)
}

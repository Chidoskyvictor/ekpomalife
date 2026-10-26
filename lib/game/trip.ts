import { useSyncExternalStore } from 'react'
import type { TripMode, Uv } from './travel-api'

/*
 * A trip from "Where to?": the trip screen (campus map, "On the way to …", progress pill)
 * stays up until the server has moved you, a short minimum time has passed, and the next
 * scene (the campus map, or your street) says it's ready. Then it fades and you're there.
 */

export type TripScene = 'map' | 'home'

export type Trip = {
  id: number
  label: string
  mode: TripMode
  from: Uv
  to: Uv
  scene: TripScene
  startedAt: number
  /** Shortest time the screen stays up, so the ride reads as a ride. */
  minMs: number
  /** Server said yes (and when: the scene timeout counts from here, not from the tap) */
  moved: boolean
  movedAt: number
  /** The next scene has loaded */
  ready: boolean
  /** Fading out */
  done: boolean
}

const MIN_MS: Record<TripMode, number> = { trek: 1600, keke: 1200, okada: 900 }
/** Give up waiting for the scene this long after the server moved you, and let the player in. */
export const TRIP_TIMEOUT_MS = 12_000

let trip: Trip | null = null
let nextId = 1
/** Scenes up and drawn right now (the map stays ready while it's mounted). */
const readyScenes = new Set<TripScene>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function patch(next: Partial<Trip>) {
  if (!trip) return
  trip = { ...trip, ...next }
  emit()
}

export function startTrip(input: Pick<Trip, 'label' | 'mode' | 'from' | 'to' | 'scene'>) {
  trip = {
    ...input,
    id: nextId++,
    startedAt: Date.now(),
    minMs: MIN_MS[input.mode],
    moved: false,
    movedAt: 0,
    ready: false,
    done: false,
  }
  emit()
  return trip.id
}

/**
 * The server moved you: now wait for the scene. A map that's already up counts as ready;
 * your street always re-spawns you at the gate, so it reports in again.
 */
export function tripMoved(id: number) {
  if (trip?.id !== id) return
  patch({ moved: true, movedAt: Date.now(), ready: trip.scene === 'map' && readyScenes.has('map') })
}

export function cancelTrip() {
  trip = null
  emit()
}

/** Fade out, then clear. */
export function endTrip(id: number) {
  if (trip?.id !== id) return
  patch({ done: true })
  window.setTimeout(() => {
    if (trip?.id === id) cancelTrip()
  }, 320)
}

/** A scene finished loading (or unmounted: ready = false). */
export function markSceneReady(scene: TripScene, ready = true) {
  if (ready) readyScenes.add(scene)
  else readyScenes.delete(scene)
  if (ready && trip?.moved && trip.scene === scene) patch({ ready: true })
}

export function useTrip() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => trip,
    () => null,
  )
}

/* —— Which side of your front door the Home tab opens on —— */

const SCENE_KEY = 'ekpoma-home-scene'
export const HOME_STREET_EVENT = 'ekpoma:home-street'
export const OPEN_TRAVEL_EVENT = 'ekpoma:open-travel'

/** Arriving home by trip: open /room on the street, at your gate. */
export function stashHomeStreet() {
  try {
    sessionStorage.setItem(SCENE_KEY, 'outside')
  } catch {
    /* storage blocked */
  }
}

export function takeHomeStreet(): boolean {
  try {
    const outside = sessionStorage.getItem(SCENE_KEY) === 'outside'
    sessionStorage.removeItem(SCENE_KEY)
    return outside
  } catch {
    return false
  }
}

export function openTravel() {
  window.dispatchEvent(new CustomEvent(OPEN_TRAVEL_EVENT))
}

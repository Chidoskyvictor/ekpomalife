'use client'

import { useSyncExternalStore } from 'react'
import { ESTATE_PLOTS } from './estates'
import { PLACES } from './places'
import { MAP_ZONES, ROADS, WORLD, type MapZone } from './world-layout'

/*
 * Driving your own car on the town map. One small store says whether a drive is on (and where
 * the player said they were going, if anywhere); the car itself lives in the map canvas
 * (components/drive/map-drive.tsx) and the buttons in components/drive/drive-hud.tsx. They share
 * `driveInput` (what the thumbs are doing) and `driveTelemetry` (where the car is), both plain
 * objects so nothing re-renders 60 times a second.
 */

export type DriveDest = { id: string; label: string }
export type DriveStart = { x: number; z: number; h: number }

type Drive = { dest: DriveDest | null; car: { id: string; model: string; color: string }; start: DriveStart; fromPlace: string }

let drive: Drive | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Everyone else on the road right now (the live map room), for the minimap. Set by the street scene. */
export const drivePeers: { current: Map<string, import('./club-live').Peer> } = { current: new Map() }
export const driveInput = { steer: 0, gas: false, brake: false }
export const driveTelemetry = { x: 0, z: 0, h: 0, speed: 0, dents: 0, bumps: 0 }
/** Looking around: drag turns the camera about the car, pinch moves it in and out. It swings back behind the car once you let go and drive on. */
export const driveView = { yaw: 0, tilt: 0, zoom: 1, held: false, at: 0 }
/** Orders to the car: `warp` puts it somewhere at once (a race's start line); `hold` keeps it still (the countdown). */
export const driveCommand: { warp: DriveStart | null; hold: boolean } = { warp: null, hold: false }

export function useDrive() {
  return useSyncExternalStore(subscribe, () => drive, () => null)
}

export function startDrive(next: Drive) {
  driveInput.steer = 0
  driveInput.gas = false
  driveInput.brake = false
  Object.assign(driveTelemetry, { x: next.start.x, z: next.start.z, h: next.start.h, speed: 0, dents: 0, bumps: 0 })
  drive = next
  emit()
}

/** Pick (or clear) where you are going while already on the road. */
export function setDriveDest(dest: DriveDest | null) {
  if (!drive) return
  drive = { ...drive, dest }
  emit()
}

export function endDrive() {
  drive = null
  Object.assign(driveView, { yaw: 0, tilt: 0, zoom: 1, held: false })
  driveCommand.warp = null
  driveCommand.hold = false
  driveInput.steer = 0
  driveInput.gas = false
  driveInput.brake = false
  emit()
}

/* —— The town as the car sees it —— */

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number }

const boxOf = (x: number, z: number, w: number, d: number): Box => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })

/** A zone's footprint on the ground (a quarter turn swaps its sides). */
function zoneBox(zone: MapZone, fill = 1): Box {
  const turned = Math.abs(Math.sin(zone.rotation)) > 0.7
  const [fw, fd] = zone.footprint
  return boxOf(zone.position[0], zone.position[1], (turned ? fd : fw) * fill, (turned ? fw : fd) * fill)
}

const solid = (zone: MapZone) => !zone.hidden && !zone.open && zone.model !== 'label' && !zone.model.startsWith('billboard')

/** Things a car bumps into: buildings (their pads, a little inside the footprint) and the estate houses. */
export const OBSTACLES: Box[] = [
  ...MAP_ZONES.filter(solid).map((zone) => zoneBox(zone, 0.8)),
  ...ESTATE_PLOTS.map((p) => boxOf(p.x, p.z, p.cellW * 0.74, p.cellD * 0.74)),
]

/** Half the car's size on the map, as a circle. */
export const CAR_RADIUS = 0.55

const WORLD_BOX = boxOf(WORLD.x, WORLD.z, WORLD.w - 6, WORLD.d - 6)

const inside = (b: Box, x: number, z: number, pad: number) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad

/** Is the car's circle inside something solid (or off the edge of the world)? */
export function blocked(x: number, z: number): boolean {
  if (!inside(WORLD_BOX, x, z, -CAR_RADIUS)) return true
  for (const b of OBSTACLES) if (inside(b, x, z, CAR_RADIUS)) return true
  return false
}

export function onRoad(x: number, z: number): boolean {
  return ROADS.some((r) => Math.abs(x - r.x) < r.w / 2 + 0.4 && Math.abs(z - r.z) < r.d / 2 + 0.4)
}

const edgeDistance = (b: Box, x: number, z: number) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ))

const PLACE_ZONES = PLACES.flatMap((place) => {
  const zone = MAP_ZONES.find((z) => z.id === place.zoneId)
  return zone ? [{ id: place.id, label: place.label, zone, box: zoneBox(zone) }] : []
})

/** How close to a place's edge you must be to park there (map units). */
export const PARK_REACH = 3.4

/** The place you could park at from here: the nearest one within reach. */
export function placeNear(x: number, z: number): { id: string; label: string } | null {
  let best: { id: string; label: string } | null = null
  let bestD = PARK_REACH
  for (const p of PLACE_ZONES) {
    const d = edgeDistance(p.box, x, z)
    if (d < bestD) {
      bestD = d
      best = { id: p.id, label: p.label }
    }
  }
  return best
}

/**
 * A clear spot beside a place to put the car: tries each side of its footprint and takes the
 * free one nearest a road, pointing along that side.
 */
export function spotBeside(placeId: string): DriveStart {
  const p = PLACE_ZONES.find((entry) => entry.id === placeId)
  if (!p) return { x: WORLD.x, z: WORLD.z, h: 0 }
  const { box } = p
  const cx = (box.minX + box.maxX) / 2
  const cz = (box.minZ + box.maxZ) / 2
  const gap = CAR_RADIUS + 1.1
  const sides: DriveStart[] = [
    { x: cx, z: box.maxZ + gap, h: Math.PI / 2 },
    { x: cx, z: box.minZ - gap, h: Math.PI / 2 },
    { x: box.maxX + gap, z: cz, h: 0 },
    { x: box.minX - gap, z: cz, h: 0 },
  ]
  const roadGap = (s: DriveStart) => Math.min(...ROADS.map((r) => edgeDistance(boxOf(r.x, r.z, r.w, r.d), s.x, s.z)))
  const free = sides.filter((s) => !blocked(s.x, s.z))
  return (free.length ? free : sides).sort((a, b) => roadGap(a) - roadGap(b))[0]!
}

/** Map speed (units a second) as the number on the dial. */
export const kmh = (speed: number) => Math.round(Math.abs(speed) * 9)

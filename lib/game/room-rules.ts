import { DEFAULT_ROOM_STYLE, MAX_ROOM_ITEMS } from './room-constants'
import type {
  ComfortBreakdown,
  ComfortStat,
  FurnitureItem,
  RoomErrorCode,
  RoomItem,
  RoomStyle,
  RoomTier,
  Rotation,
} from './room-types'

export function rotatedFootprint(
  footprint: { w: number; d: number },
  rotation: Rotation,
): { w: number; d: number } {
  if (rotation === 90 || rotation === 270) return { w: footprint.d, d: footprint.w }
  return { w: footprint.w, d: footprint.d }
}

function cellsCovered(x: number, z: number, w: number, d: number): string[] {
  const cells: string[] = []
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      cells.push(`${x + dx},${z + dz}`)
    }
  }
  return cells
}

export function cellsOf(item: RoomItem, def: FurnitureItem): string[] {
  const { w, d } = rotatedFootprint(def.footprint, item.rotation)
  return cellsCovered(item.x, item.z, w, d)
}

export type LayoutFail = { ok: false; code: RoomErrorCode; uid: string }
export type LayoutOk = { ok: true }

/**
 * Placement rules — must stay identical to lib/game/room-rules.ts.
 */
export function validateLayout(
  items: RoomItem[],
  catalog: Map<string, FurnitureItem> | Record<string, FurnitureItem>,
  tier: RoomTier,
): LayoutOk | LayoutFail {
  const get = (id: string) =>
    catalog instanceof Map ? catalog.get(id) : (catalog as Record<string, FurnitureItem>)[id]

  if (items.length > MAX_ROOM_ITEMS) {
    return { ok: false, code: 'TOO_MANY', uid: items[0]?.uid ?? '' }
  }

  const counts = new Map<string, number>()
  for (const item of items) {
    const def = get(item.itemId)
    if (!def) return { ok: false, code: 'UNKNOWN_ITEM', uid: item.uid }
    counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + 1)
    if ((counts.get(item.itemId) ?? 0) > def.maxPerRoom) {
      return { ok: false, code: 'TOO_MANY', uid: item.uid }
    }
    if (def.minTier > tier.tier) {
      // Owned over-tier items must be unplaced
      if (item.placed) return { ok: false, code: 'TIER_LOCKED', uid: item.uid }
    }
  }

  const floorOccupied = new Map<string, string>() // cell -> uid
  const rugOccupied = new Map<string, string>()
  const wallOccupied = new Map<string, string>()

  for (const item of items) {
    if (!item.placed) continue
    const def = get(item.itemId)!
    const rot = item.rotation
    if (rot !== 0 && rot !== 90 && rot !== 180 && rot !== 270) {
      return { ok: false, code: 'BAD_ROTATION', uid: item.uid }
    }
    if (def.wallMounted && rot !== 0) {
      return { ok: false, code: 'BAD_ROTATION', uid: item.uid }
    }

    const { w, d } = rotatedFootprint(def.footprint, rot)
    if (
      !Number.isInteger(item.x) ||
      !Number.isInteger(item.z) ||
      item.x < 0 ||
      item.z < 0 ||
      item.x + w > tier.grid.w ||
      item.z + d > tier.grid.d
    ) {
      return { ok: false, code: 'OUT_OF_BOUNDS', uid: item.uid }
    }

    if (def.wallMounted) {
      if (item.z !== 0) return { ok: false, code: 'WALL_ONLY_BACK', uid: item.uid }
      for (const cell of cellsCovered(item.x, item.z, w, d)) {
        if (wallOccupied.has(cell)) return { ok: false, code: 'OVERLAP', uid: item.uid }
        wallOccupied.set(cell, item.uid)
      }
      continue
    }

    const isRug = item.itemId === 'rug-ankara'
    for (const cell of cellsCovered(item.x, item.z, w, d)) {
      if (isRug) {
        if (rugOccupied.has(cell)) return { ok: false, code: 'OVERLAP', uid: item.uid }
        rugOccupied.set(cell, item.uid)
      } else {
        if (floorOccupied.has(cell)) return { ok: false, code: 'OVERLAP', uid: item.uid }
        floorOccupied.set(cell, item.uid)
      }
    }
  }

  return { ok: true }
}

function diminishingFactor(copyIndex: number): number {
  if (copyIndex === 0) return 1
  if (copyIndex === 1) return 0.5
  return 0
}

/**
 * Comfort calc — server is truth; client mock copies for preview only.
 */
export function computeComfort(
  items: RoomItem[],
  catalog: Map<string, FurnitureItem> | Record<string, FurnitureItem>,
  tier: RoomTier,
  style: RoomStyle,
): ComfortBreakdown {
  const get = (id: string) =>
    catalog instanceof Map ? catalog.get(id) : (catalog as Record<string, FurnitureItem>)[id]

  const placed = items.filter((item) => {
    if (!item.placed) return false
    const def = get(item.itemId)
    return def && def.minTier <= tier.tier
  })

  const placedIds = new Set(placed.map((p) => p.itemId))
  const replaced = new Set<string>()
  for (const id of placedIds) {
    const def = get(id)
    if (def?.replaces) replaced.add(def.replaces)
  }

  const active = placed.filter((item) => !replaced.has(item.itemId))

  const byItemId = new Map<string, RoomItem[]>()
  for (const item of active) {
    const list = byItemId.get(item.itemId) ?? []
    list.push(item)
    byItemId.set(item.itemId, list)
  }

  const raw: Record<ComfortStat, number> = {
    sleepQuality: 0,
    happiness: 0,
    study: 0,
    hygiene: 0,
  }

  for (const [itemId, copies] of byItemId) {
    const def = get(itemId)
    if (!def) continue
    copies.forEach((_copy, index) => {
      const factor = diminishingFactor(index)
      for (const [stat, value] of Object.entries(def.comfort) as [ComfortStat, number][]) {
        raw[stat] += (value ?? 0) * factor
      }
    })
  }

  if (style.wallColor !== DEFAULT_ROOM_STYLE.wallColor) raw.happiness += 3
  if (style.floorId !== 'cement') raw.happiness += 2

  const sleepQuality = Math.min(30, Math.round(raw.sleepQuality))
  const happiness = Math.min(30, Math.round(raw.happiness))
  const study = Math.min(20, Math.round(raw.study))
  const hygiene = Math.min(20, Math.round(raw.hygiene))

  const score = Math.min(
    100,
    Math.round(
      (sleepQuality / 30) * 40 + (happiness / 30) * 30 + (study / 20) * 15 + (hygiene / 20) * 15,
    ),
  )

  const label: ComfortBreakdown['label'] =
    score < 20 ? 'Bare' : score < 45 ? 'Manageable' : score < 75 ? 'Cosy' : 'Big boy/girl room'

  return {
    sleepQuality,
    happiness,
    study,
    hygiene,
    score,
    label,
    sleepEnergyBonusPct: sleepQuality,
    dailyFunBonus: Math.floor(happiness / 6),
  }
}

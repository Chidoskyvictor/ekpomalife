/** Dev-only map zone nudges (persisted in localStorage until pasted into world-layout). */

export type ZoneOverride = {
  x?: number
  z?: number
  rotation?: number
  /** Extra Y on the model root (not the group). */
  modelY?: number
  /** Multiplies Kenney / GLB uniform scale after fitToPad. */
  scaleMul?: number
}

export type ZonePlacement = {
  x: number
  z: number
  rotation: number
  modelY: number
  scaleMul: number
}

// v2: older saved nudges were moving the school gate and resizing billboard 3 after those
// values had been baked into world-layout, so anything saved before then is ignored.
const STORAGE_KEY = 'ekpo-zone-overrides-v2'

export function isZoneDebugEnabled() {
  if (process.env.NEXT_PUBLIC_ZONE_DEBUG === '0') return false
  return process.env.NODE_ENV === 'development'
}

export function readZoneOverrides(): Record<string, ZoneOverride> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const all = JSON.parse(raw) as Record<string, ZoneOverride>
    // scaleMul baked in world-layout for the school gate
    if (all['aau-gate']?.scaleMul != null) {
      const { scaleMul: _drop, ...rest } = all['aau-gate']
      if (Object.keys(rest).length > 0) all['aau-gate'] = rest
      else delete all['aau-gate']
    }
    return all
  } catch {
    return {}
  }
}

export function writeZoneOverrides(all: Record<string, ZoneOverride>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function mergeZonePlacement(
  zoneId: string,
  base: {
    position: [number, number]
    rotation: number
    scale?: number
    modelY?: number
    scaleMul?: number
  },
  overrides: Record<string, ZoneOverride>,
): ZonePlacement {
  const o = overrides[zoneId]
  return {
    x: o?.x ?? base.position[0],
    z: o?.z ?? base.position[1],
    rotation: o?.rotation ?? base.rotation,
    modelY: o?.modelY ?? base.modelY ?? 0,
    scaleMul: o?.scaleMul ?? base.scaleMul ?? 1,
  }
}

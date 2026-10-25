import { ROOM_CAMERA, type RoomCameraPlacement } from './room-camera'

export type RoomCameraOverride = Partial<RoomCameraPlacement>

export type RoomCameraLive = RoomCameraPlacement & { distance: number }

const STORAGE_KEY = 'ekpo-room-camera-v7'
const LEGACY_STORAGE_KEYS = ['ekpo-room-camera-v4', 'ekpo-room-camera-v5', 'ekpo-room-camera-v6']

export function isRoomCameraDebugEnabled() {
  if (process.env.NEXT_PUBLIC_ROOM_CAMERA_DEBUG === '0') return false
  return process.env.NODE_ENV === 'development'
}

export function readRoomCameraOverride(): RoomCameraOverride {
  if (typeof window === 'undefined') return {}
  try {
    for (const legacy of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(legacy)
    }
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as RoomCameraOverride
  } catch {
    return {}
  }
}

export function writeRoomCameraOverride(override: RoomCameraOverride) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(override))
  } catch {
    /* ignore */
  }
}

export function clearRoomCameraOverride() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function mergeRoomCamera(override: RoomCameraOverride): RoomCameraPlacement {
  return {
    position: override.position ?? ROOM_CAMERA.position,
    target: override.target ?? ROOM_CAMERA.target,
    fov: override.fov ?? ROOM_CAMERA.fov,
    minDistance: override.minDistance ?? ROOM_CAMERA.minDistance,
    maxDistance: override.maxDistance ?? ROOM_CAMERA.maxDistance,
  }
}

export function roundCamera(n: number, digits = 3) {
  const p = 10 ** digits
  return Math.round(n * p) / p
}

export function formatRoomCameraSnippet(placement: RoomCameraPlacement) {
  const p = placement.position.map((n) => roundCamera(n))
  const t = placement.target.map((n) => roundCamera(n))
  return `// room-camera.ts — default camera
position: [${p.join(', ')}],
target: [${t.join(', ')}],
fov: ${roundCamera(placement.fov, 1)},
minDistance: ${roundCamera(placement.minDistance, 2)},
maxDistance: ${roundCamera(placement.maxDistance, 2)},`
}

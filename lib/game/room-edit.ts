import { FURNITURE_BY_ID } from './room-constants'
import { rotatedFootprint, validateLayout } from './room-rules'
import type { RoomItem, RoomTier, Rotation } from './room-types'

const ROTATIONS: Rotation[] = [0, 90, 180, 270]

export function nextRotation(rotation: Rotation): Rotation {
  const i = ROTATIONS.indexOf(rotation)
  return ROTATIONS[(i + 1) % ROTATIONS.length]!
}

export function rotateItem(items: RoomItem[], uid: string): RoomItem[] {
  return items.map((row) =>
    row.uid === uid ? { ...row, rotation: nextRotation(row.rotation) } : row,
  )
}

export function moveItem(items: RoomItem[], uid: string, dx: number, dz: number): RoomItem[] {
  return items.map((row) =>
    row.uid === uid ? { ...row, x: row.x + dx, z: row.z + dz } : row,
  )
}

export function storeItem(items: RoomItem[], uid: string): RoomItem[] {
  return items.map((row) =>
    row.uid === uid ? { ...row, placed: false, x: 0, z: 0, rotation: 0 } : row,
  )
}

export function firstFreeSpot(
  items: RoomItem[],
  itemId: string,
  uid: string,
  tier: RoomTier,
): { x: number; z: number } | null {
  const def = FURNITURE_BY_ID.get(itemId)
  if (!def) return null
  const { w, d } = rotatedFootprint(def.footprint, 0)
  for (let z = 0; z <= tier.grid.d - d; z++) {
    for (let x = 0; x <= tier.grid.w - w; x++) {
      const next = items.map((row) =>
        row.uid === uid ? { ...row, placed: true, x, z, rotation: 0 as Rotation } : row,
      )
      if (validateLayout(next, FURNITURE_BY_ID, tier).ok) return { x, z }
    }
  }
  return null
}

export type EditStack = { past: RoomItem[][]; future: RoomItem[][] }

export function pushEdit(stack: EditStack, current: RoomItem[], next: RoomItem[]): EditStack {
  return {
    past: [...stack.past, current].slice(-30),
    future: [],
  }
}

export function undoEdit(stack: EditStack, current: RoomItem[]): { stack: EditStack; items: RoomItem[] } | null {
  const prev = stack.past[stack.past.length - 1]
  if (!prev) return null
  return {
    stack: { past: stack.past.slice(0, -1), future: [current, ...stack.future].slice(0, 30) },
    items: prev,
  }
}

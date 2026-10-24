import {
  FRONT_SLAB_EXT,
  HOSTEL_GRID,
  REAR_HOSTEL_COLS,
  REAR_HOSTEL_ROWS,
  REAR_HOSTEL_SLAB,
  type Slab,
} from './world-layout'

export const HOSTEL_GLB = '/models/hostel.glb'

export type HostelSlot = {
  x: number
  z: number
  rotation: number
  cellW: number
  cellD: number
}

type HostelGridOpts = {
  marginX?: number
  marginZ?: number
  /** Fraction of each cell used for model footprint (smaller = tighter packing). */
  cellFill?: number
}

export function hostelSlotsOnSlab(
  slab: Slab,
  cols: number,
  rows: number,
  maxCount = cols * rows,
  opts: HostelGridOpts = {},
): HostelSlot[] {
  const marginX = slab.w * (opts.marginX ?? 0.045)
  const marginZ = slab.d * (opts.marginZ ?? 0.05)
  const cellFill = opts.cellFill ?? 0.8
  const innerW = slab.w - 2 * marginX
  const innerD = slab.d - 2 * marginZ
  const cellW = innerW / cols
  const cellD = innerD / rows
  const west = slab.x - slab.w / 2
  const north = slab.z - slab.d / 2

  const slots: HostelSlot[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slots.push({
        x: west + marginX + (col + 0.5) * cellW,
        z: north + marginZ + (row + 0.5) * cellD,
        rotation: (row + col) % 2 === 0 ? 0 : Math.PI,
        cellW: cellW * cellFill,
        cellD: cellD * cellFill,
      })
    }
  }
  return slots.slice(0, maxCount)
}

/** East south extension — 40 hostels */
export function extSlabHostelSlots() {
  return hostelSlotsOnSlab(FRONT_SLAB_EXT, 8, 5, 40)
}

/** North slab behind campus — 112 hostels (16×7). With the 40 east hostels that is ~150 on the map. */
export const REAR_HOSTEL_SLAB_COUNT = REAR_HOSTEL_COLS * REAR_HOSTEL_ROWS

export function rearHostelSlabSlots() {
  // Same margins, cell size and fill as the east extension, so both districts look alike
  return hostelSlotsOnSlab(REAR_HOSTEL_SLAB, REAR_HOSTEL_COLS, REAR_HOSTEL_ROWS, REAR_HOSTEL_SLAB_COUNT, {
    marginX: HOSTEL_GRID.marginX / REAR_HOSTEL_SLAB.w,
    marginZ: HOSTEL_GRID.marginZ / REAR_HOSTEL_SLAB.d,
  })
}

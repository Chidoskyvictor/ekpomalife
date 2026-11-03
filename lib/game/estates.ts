import { extSlabHostelSlots, rearHostelSlabSlots, type HostelSlot } from './hostel-slab-layout'

/*
 * The estates: the hostel-house grids on the map, where every player has a house (like Lagos
 * Life). Plot numbers match backend/src/game/houses.ts: the north grid row by row (16 × 7),
 * then the east grid (8 × 5).
 */
export const ESTATE_PLOTS: HostelSlot[] = [...rearHostelSlabSlots(), ...extSlabHostelSlots()]

export const plotSelectId = (plot: number) => `house:${plot}`
export const plotFromSelectId = (id: string | null | undefined) =>
  id?.startsWith('house:') ? Number(id.slice('house:'.length)) : null

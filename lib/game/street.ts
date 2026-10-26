import type { RoomLayout } from './room-layouts'
import type { LodgingId } from './room-types'

/*
 * The shared street outside your home. Every player with the same home type loads the same
 * template: a row of LOTS compounds (or hostel doors) along one side of a road. The block of
 * house numbers shown is the one holding yours, and your lot gets the "Your house" tag. The
 * other lots are decoration: only the road is walkable.
 *
 * Coordinates: floor at y 0, x along the road, the fence / building front on z 0, houses
 * behind it (z < 0), the road in front (z > 0) toward the camera.
 */

export const LOTS = 6

export type StreetKind = 'compound' | 'block'

export type StreetTemplate = {
  id: 'single-room' | 'selfcon' | 'one-bedroom' | 'hostel'
  label: string
  kind: StreetKind
  /** Width of one lot (compound) or one door bay (hostel block). */
  lotW: number
  house: { w: number; d: number; h: number }
  /** Gap left in the fence (compound) or door width (block). */
  gateW: number
  fenceH: number
}

const TEMPLATES: Record<StreetTemplate['id'], StreetTemplate> = {
  'single-room': {
    id: 'single-room',
    label: 'Poultry road',
    kind: 'compound',
    lotW: 7,
    house: { w: 5.4, d: 4.2, h: 2.8 },
    gateW: 1.6,
    fenceH: 1.8,
  },
  selfcon: {
    id: 'selfcon',
    label: 'G2 close',
    kind: 'compound',
    lotW: 8,
    house: { w: 6.2, d: 5.2, h: 3 },
    gateW: 1.8,
    fenceH: 1.9,
  },
  'one-bedroom': {
    id: 'one-bedroom',
    label: 'Ojo street',
    kind: 'compound',
    lotW: 9.5,
    house: { w: 7.4, d: 6.2, h: 3.2 },
    gateW: 2.2,
    fenceH: 2,
  },
  hostel: {
    id: 'hostel',
    label: 'School hostel',
    kind: 'block',
    lotW: 3.4,
    house: { w: 3.4, d: 7, h: 6.2 },
    gateW: 1.1,
    fenceH: 0,
  },
}

export function streetForLodging(lodgingId: LodgingId | string | null | undefined): StreetTemplate {
  if (lodgingId === 'hostel-poultry') return TEMPLATES.hostel
  if (lodgingId === 'selfcon-g2') return TEMPLATES.selfcon
  if (lodgingId === 'onebed-ojo') return TEMPLATES['one-bedroom']
  return TEMPLATES['single-room']
}

/** Your lot (0 … LOTS-1) and the house numbers shown on the row. */
export function lotsFor(houseNumber: number | null | undefined) {
  const n = houseNumber && houseNumber > 0 ? Math.floor(houseNumber) : 1
  const first = Math.floor((n - 1) / LOTS) * LOTS + 1
  return { own: (n - 1) % LOTS, numbers: Array.from({ length: LOTS }, (_, i) => first + i) }
}

/** x of a lot's gate / door centre. */
export function lotX(t: StreetTemplate, i: number) {
  return (i - (LOTS - 1) / 2) * t.lotW
}

/** Road (and pavement) where you can walk. */
export const ROAD = { z0: 0.45, z1: 6.2 }

/** How close (m) to your gate the "Go inside" button shows. */
export const GATE_REACH = 3

/** Where you stand when you come out of your gate. */
export function gateSpot(t: StreetTemplate, own: number): [number, number] {
  return [lotX(t, own), 1.3]
}

/** The street as a walkable layout for RoomPlayer (same tap-to-walk and keys as inside). */
export function streetLayout(t: StreetTemplate, own: number): RoomLayout {
  const half = (LOTS * t.lotW) / 2
  return {
    id: 'street',
    label: t.label,
    glb: '',
    floors: [[-half + 0.4, ROAD.z0, half - 0.4, ROAD.z1]],
    blocks: [],
    start: gateSpot(t, own),
    spots: {},
    tapBoxes: {},
    host: { position: [0, 0, 0], rotation: 0 },
    view: 'front',
    cameraScale: 1,
    speed: 3.4,
  }
}

import type { Appearance } from './look'
import { seatKey, type FurnitureSpot, type HallSeat, type RoomLayout } from './room-layouts'

/*
 * Shared bits for food places with their own 3D room (Spot Rite, Mama Amina Bukka): seats you
 * can sit on, NPCs (staff behind the counter, diners at tables), and the counter spot you walk
 * to to order. Ordering works like Wise Gourmet: walk up, the staff greet you, pick, buy and eat.
 * A character with heading 0 faces +z (the camera); π faces −z.
 */

export const FACE_BACK = Math.PI // −z
export const FACE_RIGHT = Math.PI / 2 // +x
export const FACE_LEFT = -Math.PI / 2 // −x
export const CHAIR_Y = -0.26
export const STOOL_Y = -0.08

export type FoodSeat = { id: string; x: number; z: number; heading: number; y: number; label: string; approach?: [number, number] }

export type FoodNpc = {
  id: string
  name: string
  role: string
  line: string
  x: number
  y: number
  z: number
  heading: number
  seated: boolean
  /** Seat id this NPC sits on (never offered to players) */
  seat?: string
  appearance: Appearance
}

export type FoodPlace = {
  name: string
  icon: string
  layout: RoomLayout
  /** Seats players can take */
  seats: HallSeat[]
  npcs: FoodNpc[]
  /** Who greets you at the counter, and what they say */
  greeter: string
  greeting: string
  orderNote: string
  /** A shop with nothing on sale yet: the counter says out of stock, nothing can be bought */
  soldOut?: boolean
}

export const ORDER_SPOT = 'seat:food-order' as const

export const look = (
  body: Appearance['body'],
  hair: Appearance['hair'],
  outfit: Appearance['outfit'],
  skin: string,
  top: string,
  bottom: string,
): Appearance => ({ body, hair, outfit, skin, hairColor: '#1b1410', topColor: top, bottomColor: bottom })

export const sq = (x: number, z: number, r: number): [number, number, number, number] => [x - r, z - r, x + r, z + r]

/** Four chairs around a square / round table at (tx, tz), `off` from its centre, each facing it. */
export function chairsAround(prefix: string, label: string, tx: number, tz: number, off: number, which: ('w' | 'e' | 'n' | 's')[] = ['w', 'e', 'n', 's']): FoodSeat[] {
  const all: Record<'w' | 'e' | 'n' | 's', FoodSeat> = {
    // w = +x side (faces −x), e = −x side (faces +x), n = −z side (faces +z), s = +z side (faces −z)
    w: { id: `${prefix}-w`, x: tx + off, z: tz, heading: FACE_LEFT, y: CHAIR_Y, label },
    e: { id: `${prefix}-e`, x: tx - off, z: tz, heading: FACE_RIGHT, y: CHAIR_Y, label },
    n: { id: `${prefix}-n`, x: tx, z: tz - off, heading: 0, y: CHAIR_Y, label },
    s: { id: `${prefix}-s`, x: tx, z: tz + off, heading: FACE_BACK, y: CHAIR_Y, label },
  }
  return which.map((k) => all[k])
}

/** Spots for every seat (approached from behind, unless given) plus the order spot at the counter. */
export function foodSpots(seats: FoodSeat[], orderAt: [number, number]): RoomLayout['spots'] {
  return {
    ...Object.fromEntries(
      seats.map((s) => {
        const back: [number, number] = s.approach ?? [s.x - Math.sin(s.heading) * 0.6, s.z - Math.cos(s.heading) * 0.6]
        return [seatKey(s.id), { approach: back, at: [s.x, s.y, s.z], heading: s.heading } satisfies FurnitureSpot]
      }),
    ),
    [ORDER_SPOT]: { approach: orderAt, at: [orderAt[0], 0, orderAt[1]], heading: FACE_BACK },
  }
}

/** Players' seats: every seat except the ones NPCs sit on. */
export function freeSeats(seats: FoodSeat[], npcs: FoodNpc[]): HallSeat[] {
  const taken = new Set(npcs.flatMap((n) => (n.seat ? [n.seat] : [])))
  return seats.filter((s) => !taken.has(s.id)).map((s) => ({ id: s.id, x: s.x, z: s.z, row: 0, heading: 0, label: s.label }))
}

/** Where a seated NPC goes (on its seat). */
export function seatedNpc(seat: FoodSeat, npc: Omit<FoodNpc, 'x' | 'y' | 'z' | 'heading' | 'seated' | 'seat'>): FoodNpc {
  return { ...npc, x: seat.x, y: seat.y, z: seat.z, heading: seat.heading, seated: true, seat: seat.id }
}

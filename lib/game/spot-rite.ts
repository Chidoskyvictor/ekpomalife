import { ORDER_SPOT, type FoodNpc, type FoodPlace } from './food-room'
import type { Appearance } from './look'
import { seatKey, type FurnitureSpot, type HallSeat, type RoomLayout } from './room-layouts'

/*
 * Spot Rite (scripts/blender/spot-rite.py, mirrored): counter + menu board along the back wall
 * (−z), banquette on the right wall (+x), round tables on the rug, a side table by the left
 * plant. Room x −6…6, z −5…5. Order at the counter like Wise Gourmet: walk up, the staff greet
 * you, pick from the menu, buy and eat. A character with heading 0 faces +z (the camera).
 */

const R = Math.PI
const L = Math.PI / 2 // faces +x
const LEFT = -Math.PI / 2 // faces −x

type Seat = { id: string; x: number; z: number; heading: number; y: number; label: string; approach?: [number, number] }
const CHAIR_Y = -0.26
const STOOL_Y = -0.08

const SEATS: Seat[] = [
  // Chairs at the banquette tables (face the table on their right, +x)
  ...[3.1, 1.3, -0.5].map((z, i) => ({ id: `sr-bt-${i + 1}`, x: 3.25, z, heading: L, y: CHAIR_Y, label: 'Window table' })),
  // The banquette itself (faces into the room, −x); reached from between the tables
  ...[3.1, 1.3, -0.5].map((z, i) => ({
    id: `sr-bench-${i + 1}`,
    x: 5.55,
    z,
    heading: LEFT,
    y: CHAIR_Y,
    label: 'Banquette',
    approach: [4.9, i === 2 ? -1.35 : z - 0.9] as [number, number],
  })),
  // Main tables: two side chairs and one end chair each
  ...(
    [
      [0.3, 3.0, 'front'],
      [-2.7, 3.0, 'back'],
      [0.3, 0.2, 'front'],
      [-2.7, 0.2, 'back'],
    ] as const
  ).flatMap(([tx, tz, end], t) => [
    { id: `sr-t${t + 1}-a`, x: tx + 0.8, z: tz, heading: LEFT, y: CHAIR_Y, label: `Table ${t + 1}` },
    { id: `sr-t${t + 1}-b`, x: tx - 0.8, z: tz, heading: L, y: CHAIR_Y, label: `Table ${t + 1}` },
    end === 'front'
      ? { id: `sr-t${t + 1}-c`, x: tx, z: tz + 0.8, heading: R, y: CHAIR_Y, label: `Table ${t + 1}` }
      : { id: `sr-t${t + 1}-c`, x: tx, z: tz - 0.8, heading: 0, y: CHAIR_Y, label: `Table ${t + 1}` },
  ]),
  // Side table by the left wall plant
  { id: 'sr-side-a', x: -5, z: -0.4, heading: R, y: CHAIR_Y, label: 'Side table' },
  { id: 'sr-side-b', x: -5, z: -2.0, heading: 0, y: CHAIR_Y, label: 'Side table' },
  // Counter stools (face the counter, −z)
  ...[1.8, 0.5, -0.8, -2.1].map((x, i) => ({ id: `sr-stool-${i + 1}`, x, z: -2.7, heading: R, y: STOOL_Y, label: 'Counter' })),
]

export type SpotRiteNpc = FoodNpc

const look = (body: Appearance['body'], hair: Appearance['hair'], outfit: Appearance['outfit'], skin: string, top: string, bottom: string): Appearance => ({
  body,
  hair,
  outfit,
  skin,
  hairColor: '#1b1410',
  topColor: top,
  bottomColor: bottom,
})

/** Two staff behind the counter (facing the room) and three diners at the tables. */
export const SPOT_RITE_NPCS: SpotRiteNpc[] = [
  { id: 'sr-staff-1', name: 'Tola', role: 'At the counter', line: 'Welcome to Spot Rite! What can I get you?', x: 1.5, y: 0, z: -4.55, heading: 0, seated: false, appearance: look('woman', 'braids', 'sitework', '#8D4E2A', '#0f766e', '#1f2937') },
  { id: 'sr-staff-2', name: 'Emeka', role: 'At the counter', line: 'The jollof is hot right now 🔥', x: -1.8, y: 0, z: -4.55, heading: 0, seated: false, appearance: look('man', 'lowcut', 'sitework', '#5C3317', '#0f766e', '#1f2937') },
  { id: 'sr-diner-1', name: 'Bisi', role: 'Eating at a table', line: 'This fried rice is too sweet!', x: -3.5, y: CHAIR_Y, z: 3.0, heading: L, seated: true, seat: 'sr-t2-b', appearance: look('woman', 'bun', 'casual', '#A56C3A', '#e85d9a', '#1f2937') },
  { id: 'sr-diner-2', name: 'Uche', role: 'Eating at a table', line: 'Best rice and chicken in Ekpoma.', x: 1.1, y: CHAIR_Y, z: 0.2, heading: LEFT, seated: true, seat: 'sr-t3-a', appearance: look('man', 'afro', 'hoodie', '#6B3F28', '#2563eb', '#111827') },
  { id: 'sr-diner-3', name: 'Ify', role: 'Eating by the window', line: 'I come here after every lecture.', x: 3.25, y: CHAIR_Y, z: 1.3, heading: L, seated: true, seat: 'sr-bt-2', appearance: look('woman', 'ponytail', 'chiller', '#8D4E2A', '#f59e0b', '#f3f0e6') },
]

const NPC_SEATS = new Set(SPOT_RITE_NPCS.flatMap((n) => (n.seat ? [n.seat] : [])))

/** Seats players can take (the diners' chairs are taken). */
export const SPOT_RITE_SEATS: HallSeat[] = SEATS.filter((s) => !NPC_SEATS.has(s.id)).map((s) => ({
  id: s.id,
  x: s.x,
  z: s.z,
  row: 0,
  heading: 0,
  label: s.label,
}))

/** Where you stand to order: at the counter between the first two stools, facing the staff. */
const ORDER_AT: [number, number] = [1.15, -3.05]

const sq = (x: number, z: number, r: number): [number, number, number, number] => [x - r, z - r, x + r, z + r]

export const SPOT_RITE: RoomLayout = {
  id: 'office',
  label: 'Spot Rite',
  glb: '/models/spot-rite.glb?v=1',
  floors: [[-5.85, -4.85, 5.85, 4.85]],
  blocks: [
    [-3.75, -5, 2.75, -3.36], // counter (and behind it)
    [5.2, -1.65, 6, 4.25], // banquette
    ...[3.1, 1.3, -0.5].map((z) => sq(4.1, z, 0.48)), // banquette tables
    ...[
      [0.3, 3.0],
      [-2.7, 3.0],
      [0.3, 0.2],
      [-2.7, 0.2],
      [-5, -1.2],
    ].map(([x, z]) => sq(x!, z!, 0.48)), // tables
    ...SEATS.filter((s) => !s.id.startsWith('sr-bench')).map((s) => sq(s.x, s.z, s.id.includes('stool') ? 0.22 : 0.24)), // chairs, stools
    sq(5.25, -4.2, 0.32), // plants
    sq(-5.2, -4.0, 0.4),
    sq(-5.2, 4.3, 0.3),
    sq(3.4, -2.2, 0.25),
  ],
  start: [-1.2, 4.4],
  spots: {
    ...Object.fromEntries(
      SEATS.map((s) => {
        // Approach from behind the seat (opposite where the sitter faces), unless given
        const back: [number, number] = s.approach ?? [s.x - Math.sin(s.heading) * 0.6, s.z - Math.cos(s.heading) * 0.6]
        return [seatKey(s.id), { approach: back, at: [s.x, s.y, s.z], heading: s.heading } satisfies FurnitureSpot]
      }),
    ),
    [ORDER_SPOT]: { approach: ORDER_AT, at: [ORDER_AT[0], 0, ORDER_AT[1]], heading: R },
  },
  tapBoxes: {},
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 1.85,
  speed: 2.4,
}

export const SPOT_RITE_PLACE: FoodPlace = {
  name: 'Spot Rite',
  icon: '🍽️',
  layout: SPOT_RITE,
  seats: SPOT_RITE_SEATS,
  npcs: SPOT_RITE_NPCS,
  greeter: 'sr-staff-1',
  greeting: 'Welcome to Spot Rite! What can I get you?',
  orderNote: 'Rice and chicken, jollof, fried rice…',
}

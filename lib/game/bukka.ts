import {
  CHAIR_Y,
  chairsAround,
  FACE_LEFT,
  FACE_RIGHT,
  foodSpots,
  freeSeats,
  look,
  seatedNpc,
  sq,
  type FoodNpc,
  type FoodPlace,
  type FoodSeat,
} from './food-room'
import type { RoomLayout } from './room-layouts'

/*
 * Mama Amina Bukka (scripts/blender/bukka.py, mirrored): red serving counter with 4 big pots and
 * the menu board on the back wall (−z), drinks fridge at the counter's left end, green wall with
 * fans on the right (+x), hand-wash corner front right, 6 square tables (4 chairs each) and a long
 * table with two benches on the left. Room x −6.5…6.5, z −5…5. Cheaper than Spot Rite.
 */

const TABLES: [number, number][] = [
  [2.9, 3.1],
  [0.1, 3.1],
  [-2.7, 3.1],
  [2.9, 0.4],
  [0.1, 0.4],
  [-2.7, 0.4],
]

const SEATS: FoodSeat[] = [
  ...TABLES.flatMap(([x, z], i) => chairsAround(`bk-t${i + 1}`, `Table ${i + 1}`, x, z, 0.68)),
  // Long table benches (4 places each side)
  ...[3.4, 2.4, 1.4, 0.4].map((z, i) => ({ id: `bk-bench-a${i + 1}`, x: -4.0, z, heading: FACE_LEFT, y: CHAIR_Y, label: 'Long table' })),
  ...[3.4, 2.4, 1.4, 0.4].map((z, i) => ({ id: `bk-bench-b${i + 1}`, x: -5.58, z, heading: FACE_RIGHT, y: CHAIR_Y, label: 'Long table' })),
]

const seat = (id: string) => SEATS.find((s) => s.id === id)!

export const BUKKA_NPCS: FoodNpc[] = [
  // Behind the counter, between the pots, facing the room
  { id: 'bk-mama', name: 'Mama Amina', role: 'Dishing out food', line: 'My pikin, come and chop! Wetin you want?', x: 1.9, y: 0, z: -4.7, heading: 0, seated: false, appearance: look('woman', 'gele', 'owambe', '#6B3F28', '#c9a227', '#7c2d12') },
  { id: 'bk-helper', name: 'Kunle', role: 'Helping at the counter', line: 'Soup dey hot today o 🔥', x: -0.9, y: 0, z: -4.7, heading: 0, seated: false, appearance: look('man', 'lowcut', 'sitework', '#5C3317', '#15803d', '#1f2937') },
  seatedNpc(seat('bk-t2-e'), { id: 'bk-diner-1', name: 'Tobi', role: 'Eating', line: 'Mama Amina jollof no get competition.', appearance: look('man', 'curls', 'casual', '#8D4E2A', '#2563eb', '#1f2937') }),
  seatedNpc(seat('bk-t6-s'), { id: 'bk-diner-2', name: 'Blessing', role: 'Eating', line: 'Cheap and sweet. I dey here every day.', appearance: look('woman', 'braids', 'casual', '#A56C3A', '#e85d9a', '#111827') }),
  seatedNpc(seat('bk-bench-a2'), { id: 'bk-diner-3', name: 'Musa', role: 'Eating at the long table', line: 'Beans and dodo before lecture!', appearance: look('man', 'classic', 'hoodie', '#6B3F28', '#f59e0b', '#1f2937') }),
]

const ORDER_AT: [number, number] = [0.5, -2.75]

export const BUKKA: RoomLayout = {
  id: 'office',
  label: 'Mama Amina Bukka',
  glb: '/models/bukka.glb?v=2',
  floors: [[-6.35, -4.85, 6.35, 4.85]],
  blocks: [
    [-3.65, -5, 3.65, -3.25], // counter (and behind it)
    [-4.85, -5, -3.75, -4.0], // drinks fridge
    [5.05, 3.55, 6.5, 4.35], // hand-wash corner
    ...TABLES.map(([x, z]) => sq(x, z, 0.47)),
    ...SEATS.filter((s) => !s.id.includes('bench')).map((s) => sq(s.x, s.z, 0.23)),
    [-5.25, -0.6, -4.35, 4.0], // long table
    [-4.2, -0.5, -3.83, 3.9], // its benches
    [-5.78, -0.5, -5.4, 3.9],
  ],
  start: [1.5, 4.5],
  spots: foodSpots(SEATS, ORDER_AT),
  tapBoxes: {},
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 1.95,
  speed: 2.4,
}

export const BUKKA_PLACE: FoodPlace = {
  name: 'Mama Amina Bukka',
  icon: '🍲',
  layout: BUKKA,
  seats: freeSeats(SEATS, BUKKA_NPCS),
  npcs: BUKKA_NPCS,
  greeter: 'bk-mama',
  greeting: 'My pikin, come and chop! Wetin you want?',
  orderNote: 'Jollof, rice and stew, beans and dodo… cheap!',
}

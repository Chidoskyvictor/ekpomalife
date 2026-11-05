import { FACE_LEFT, look, sq, type FoodNpc, type FoodPlace, type FoodSeat } from './food-room'
import { seatKey, type FurnitureSpot, type RoomLayout } from './room-layouts'

/*
 * Play and Chill (scripts/blender/play-chill.py): a five-a-side turf pitch in a chain-link cage
 * (x −7.8…4.4, z −5.4…4.6, gates at the front x −1.6…−0.2 and the +x side z 0.6…2.0), and a
 * viewing shed outside the cage on the +x side with three benches facing the pitch. Players walk
 * in, sit and watch, or tap "Play football" to run onto the pitch for a game (a timed activity).
 * Same live room as every walk-in place.
 */

const BENCH_Y = 0.48 - 0.77
const SEATS: FoodSeat[] = [-3.6, -0.6, 2.6].flatMap((z, i) =>
  [-0.6, 0.6].map((dz, j) => ({ id: `pc-bench-${i + 1}-${j + 1}`, x: 5.55, z: z + dz, heading: FACE_LEFT, y: BENCH_Y, label: 'Bench' })),
)

/** Five-a-side in progress: a few players on the pitch, one keeper in each goal. */
const NPCS: FoodNpc[] = [
  { id: 'pc-p1', name: 'Tunde', role: 'Playing ball', line: 'Pass am! Pass am!', x: -1.3, y: 0, z: -0.8, heading: Math.PI / 2, seated: false, appearance: look('man', 'lowcut', 'hoodie', '#5C3317', '#16a34a', '#111827') },
  { id: 'pc-p2', name: 'Chidi', role: 'Playing ball', line: 'Na me go score the next goal ⚽', x: 0.2, y: 0, z: 1.4, heading: -Math.PI / 2, seated: false, appearance: look('man', 'afro', 'casual', '#6B3F28', '#dc2626', '#111827') },
  { id: 'pc-p3', name: 'Seyi', role: 'Playing ball', line: 'Come join, we need one more player!', x: -3.4, y: 0, z: 1.0, heading: Math.PI / 2, seated: false, appearance: look('man', 'lowcut', 'casual', '#8D4E2A', '#16a34a', '#f3f0e6') },
  { id: 'pc-p4', name: 'Emma', role: 'Playing ball', line: 'This turf sweet to play!', x: -2.2, y: 0, z: -2.6, heading: 0.4, seated: false, appearance: look('man', 'afro', 'hoodie', '#5C3317', '#dc2626', '#1f2937') },
  { id: 'pc-gk1', name: 'Bayo', role: 'In goal', line: 'Nothing passes me today.', x: -6.9, y: 0, z: -0.5, heading: Math.PI / 2, seated: false, appearance: look('man', 'lowcut', 'sitework', '#6B3F28', '#facc15', '#111827') },
  { id: 'pc-gk2', name: 'Kola', role: 'In goal', line: 'Shoot if you are sure!', x: 3.3, y: 0, z: -0.5, heading: -Math.PI / 2, seated: false, appearance: look('man', 'braids', 'sitework', '#8D4E2A', '#2563eb', '#111827') },
]

const PITCH_KEY = seatKey('pc-pitch')
/** Where you run to when you join the game (open space near the centre circle). */
const PITCH_AT: [number, number] = [-1.0, 0.6]

/** Fence lines as thin blocks, leaving the two gates open. */
const T = 0.12
const FENCE: [number, number, number, number][] = [
  [-7.9, -5.5, 4.5, -5.4 + T], // back
  [-7.9, -5.5, -7.8 + T, 4.7], // west
  [-7.9, 4.6 - T, -1.6, 4.7], // front, left of the gate
  [-0.2, 4.6 - T, 4.5, 4.7], // front, right of the gate
  [4.4 - T, -5.5, 4.5, 0.6], // +x side, above the gate
  [4.4 - T, 2.0, 4.5, 4.7], // +x side, below the gate
]

const benchSpots: Record<string, FurnitureSpot> = Object.fromEntries(
  // Walk up from the pitch side of the bench; sitters face the pitch (−x)
  SEATS.map((s) => [seatKey(s.id), { approach: [4.85, s.z], at: [s.x, s.y, s.z], heading: s.heading } satisfies FurnitureSpot]),
)

export const PLAY_CHILL: RoomLayout = {
  id: 'office',
  label: 'Play and Chill',
  glb: '/models/play-chill.glb?v=1',
  floors: [[-8.3, -5.8, 8.3, 5.8]],
  blocks: [
    ...FENCE,
    [-7.6, -1.75, -6.95, 0.75], // west goal
    [3.75, -1.75, 4.3, 0.75], // east goal
    ...[-3.6, -0.6, 2.6].map((z): [number, number, number, number] => [5.3, z - 1.1, 5.85, z + 1.1]), // benches
    [7.3, -6, 8.5, 6], // under the thatch, by the wall
    ...NPCS.map((n) => sq(n.x, n.z, 0.3)),
  ],
  start: [-0.9, 5.3],
  spots: {
    ...benchSpots,
    [PITCH_KEY]: { approach: PITCH_AT, at: [PITCH_AT[0], 0, PITCH_AT[1]], heading: -Math.PI / 2 } satisfies FurnitureSpot,
  },
  tapBoxes: {},
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 2.3,
  speed: 2.6,
}

export const PLAY_CHILL_PLACE: FoodPlace = {
  name: 'Play and Chill',
  icon: '⚽',
  layout: PLAY_CHILL,
  seats: SEATS.map((s) => ({ id: s.id, x: s.x, z: s.z, row: 0, heading: 0, label: s.label })),
  npcs: NPCS,
  greeter: 'pc-p3',
  greeting: 'Come join, we need one more player!',
  orderNote: '',
  play: { spot: PITCH_KEY, emoji: '⚽', title: 'Play football', seconds: 30, note: 'Play a full match: +Fun, +Social', style: 'dance' },
}

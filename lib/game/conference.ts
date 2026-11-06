import { CHAIR_Y, FACE_BACK, look, sq, type FoodNpc, type FoodPlace, type FoodSeat } from './food-room'
import { seatKey, type FurnitureSpot, type RoomLayout } from './room-layouts'

/*
 * Student Conference (scripts/blender/conference-hall.py): a big hall, floor x −8…6, z −6…6.
 * Carpeted stage at the back (x −6.5…4.5, z −6…−3.9, 0.45 m up) with a podium at x −1.0; six rows
 * of maroon chairs facing it (left block x −6.2…−3.0, centre aisle, right block x 0.2…3.4).
 * Outside: road ring and campus blocks with rooftop signs (Mass Communication, Cordelia Hall).
 */

const ROWS = [-2.7, -1.5, -0.3, 0.9, 2.1, 3.3]
const COLS = [-6.2, -5.4, -4.6, -3.8, -3.0, 0.2, 1.0, 1.8, 2.6, 3.4]
const STAGE_Y = 0.45

const SEATS: FoodSeat[] = ROWS.flatMap((z, r) =>
  COLS.map((x, c) => ({ id: `cf-${r + 1}-${c + 1}`, x, z, heading: FACE_BACK, y: CHAIR_Y, label: 'Chair' })),
)
const seatAt = (r: number, c: number) => SEATS[(r - 1) * COLS.length + (c - 1)]

const sit = (id: string, name: string, line: string, r: number, c: number, appearance: FoodNpc['appearance']): FoodNpc => {
  const s = seatAt(r, c)
  return { id, name, role: 'Delegate', line, x: s.x, y: CHAIR_Y, z: s.z, heading: FACE_BACK, seated: true, seat: s.id, appearance }
}

const NPCS: FoodNpc[] = [
  { id: 'cf-mc', name: 'Ifeoma', role: 'Host', line: 'Welcome! The podium is open, come share your idea.', x: -2.7, y: STAGE_Y, z: -4.5, heading: 0.3, seated: false, appearance: look('woman', 'braids', 'office', '#8D4E2A', '#16a34a', '#111827') },
  { id: 'cf-usher', name: 'Daniel', role: 'Usher', line: 'Sit anywhere you like. Talks start soon.', x: -1.4, y: 0, z: 4.9, heading: Math.PI, seated: false, appearance: look('man', 'lowcut', 'office', '#5C3317', '#f3f0e6', '#1f2937') },
  sit('cf-d1', 'Amaka', 'This topic is really good.', 1, 2, look('woman', 'gele', 'owambe', '#A56C3A', '#7c3aed', '#1f2937')),
  sit('cf-d2', 'Tobi', 'I want to ask a question after.', 2, 7, look('man', 'afro', 'casual', '#6B3F28', '#2563eb', '#111827')),
  sit('cf-d3', 'Ese', 'Mass Comm students always bring the vibes.', 3, 4, look('woman', 'braids', 'casual', '#8D4E2A', '#dc2626', '#1f2937')),
  sit('cf-d4', 'Osas', 'Taking notes for my project.', 4, 9, look('man', 'classic', 'office', '#5C3317', '#0ea5e9', '#2b2f3a')),
]

const PODIUM_KEY = seatKey('cf-podium')

/** Each block of chairs, as one solid row (the gaps between rows stay walkable). */
const chairRows = ROWS.flatMap((z): [number, number, number, number][] => [
  [-6.5, z - 0.27, -2.7, z + 0.33],
  [-0.1, z - 0.27, 3.7, z + 0.33],
])

const seatSpots: Record<string, FurnitureSpot> = Object.fromEntries(
  // Step in from the row in front, then sit facing the stage
  SEATS.map((s) => [seatKey(s.id), { approach: [s.x, s.z - 0.56], at: [s.x, s.y, s.z], heading: s.heading } satisfies FurnitureSpot]),
)

export const CONFERENCE: RoomLayout = {
  id: 'office',
  label: 'Student Conference',
  glb: '/models/conference-hall.glb?v=3',
  floors: [[-8, -6, 6, 6]],
  blocks: [
    [-6.5, -6.2, 4.5, -3.85], // stage
    ...chairRows,
    [-7.7, -3.7, -7.1, -3.1], // plants
    [5.0, -3.7, 5.6, -3.1],
    [5.0, 5.0, 5.6, 5.6],
    ...NPCS.filter((n) => !n.seated && n.y === 0).map((n) => sq(n.x, n.z, 0.3)),
  ],
  start: [-1.4, 5.5],
  spots: {
    ...seatSpots,
    // Up the steps and behind the podium, facing the hall
    [PODIUM_KEY]: { approach: [-1.0, -3.4], at: [-1.0, STAGE_Y, -5.15], heading: 0 } satisfies FurnitureSpot,
  },
  // Every free chair can be tapped to sit on it
  tapBoxes: Object.fromEntries(
    SEATS.filter((s) => !NPCS.some((n) => n.seat === s.id)).map((s) => [seatKey(s.id), [s.x - 0.28, 0, s.z - 0.28, s.x + 0.28, 1.05, s.z + 0.33]]),
  ),
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 2.3,
  speed: 2.6,
}

export const CONFERENCE_PLACE: FoodPlace = {
  name: 'Student Conference',
  icon: '🎤',
  layout: CONFERENCE,
  seats: SEATS.filter((s) => !NPCS.some((n) => n.seat === s.id)).map((s) => ({ id: s.id, x: s.x, z: s.z, row: 0, heading: 0, label: s.label })),
  npcs: NPCS,
  greeter: 'cf-usher',
  greeting: 'Welcome to the Student Conference. Sit anywhere!',
  orderNote: '',
  stage: { spot: PODIUM_KEY, screen: { at: [-1.0, 2.41, -5.86], size: [7.0, 1.58] } },
  play: { spot: PODIUM_KEY, emoji: '🎤', title: 'Give a talk', seconds: 30, note: 'Speak at the podium: +Fun, +Social', style: 'stand' },
}

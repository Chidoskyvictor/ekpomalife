import { CHAIR_Y } from './food-room'
import { seatKey, type FurnitureSpot, type HallSeat, type RoomLayout } from './room-layouts'

/*
 * The class every lecture hall uses (scripts/blender/class-hall.py): floor x −7…6, z −6…6, a low
 * platform with the chalkboard at the back (−z, 0.22 m up), louvre windows on the +x wall, and six
 * rows of separate wooden chairs with writing arms facing the board (aisle at x ≈ −1.6).
 * Outside: ring road, cement pavers and white blocks whose two signs name the neighbours.
 */

const ROWS = [-2.6, -1.3, 0.0, 1.3, 2.6, 3.9]
const COLS = [-6.0, -4.9, -3.8, -2.7, -0.5, 0.6, 1.7, 2.8, 3.9]

/** heading 0 = facing the board (−z), like the old lecture hall's seats. */
export const CLASS_SEATS: HallSeat[] = ROWS.flatMap((z, r) =>
  COLS.map((x, c) => ({ id: `cl-${r + 1}-${c + 1}`, x, z, row: r + 1, heading: 0, front: r === 0, label: `row ${r + 1}` })),
)

export const CLASS_HALL: RoomLayout = {
  id: 'lecture-hall',
  label: 'Lecture hall',
  glb: '/models/class-hall.glb?v=1',
  floors: [[-7, -6, 6, 6]],
  blocks: [
    [-5.6, -6.2, 4.6, -4.25], // platform, board and the lecturer's table
  ],
  start: [-1.6, 5.4],
  spots: Object.fromEntries(
    // Step in from the left of the chair (the writing arm is on the right), sit facing the board
    CLASS_SEATS.map((s) => [seatKey(s.id), { approach: [s.x - 0.5, s.z], at: [s.x, CHAIR_Y, s.z], heading: Math.PI } satisfies FurnitureSpot]),
  ),
  // Tap any chair to sit on it
  tapBoxes: Object.fromEntries(CLASS_SEATS.map((s) => [seatKey(s.id), [s.x - 0.26, 0, s.z - 0.42, s.x + 0.34, 1.0, s.z + 0.26]])),
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 2.2,
  speed: 2.6,
}

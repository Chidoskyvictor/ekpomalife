import { foodSpots, look, sq, type FoodNpc, type FoodPlace } from './food-room'
import type { RoomLayout } from './room-layouts'

/*
 * Dublous supermarket (scripts/blender/dublous.py, mirrored): four shelf rows down the middle,
 * a wall unit on the right wall (+x), fridges and a freezer at the back right, the checkout
 * counter at the back left (−z). Room x −6.5…6.5, z −5…5. Nothing is on sale yet: the shelves
 * are empty and the cashier says so. Players walk in, walk around and see each other (same live
 * room as every walk-in place).
 */

const NPCS: FoodNpc[] = [
  { id: 'db-cashier', name: 'Ada', role: 'At the till', line: 'Sorry o, everything is out of stock. New goods are coming soon!', x: -2.6, y: 0, z: -4.0, heading: 0, seated: false, appearance: look('woman', 'braids', 'sitework', '#8D4E2A', '#1d4ed8', '#1f2937') },
  { id: 'db-staff', name: 'Kelvin', role: 'Stocking shelves', line: 'We are restocking. Check back soon.', x: 4.6, y: 0, z: 1.8, heading: -Math.PI / 2, seated: false, appearance: look('man', 'lowcut', 'sitework', '#5C3317', '#facc15', '#1f2937') },
]

/** Stand in front of the counter, facing the cashier. */
const ORDER_AT: [number, number] = [-2.6, -2.0]

export const DUBLOUS: RoomLayout = {
  id: 'office',
  label: 'Dublous',
  glb: '/models/dublous.glb?v=2',
  floors: [[-6.35, -4.85, 6.35, 4.85]],
  blocks: [
    [2.75, -1.0, 3.55, 4.2], // shelf rows
    [0.55, -1.0, 1.35, 4.2],
    [-1.65, -1.0, -0.85, 4.2],
    [-3.85, -1.0, -3.05, 4.2],
    [5.85, -1.55, 6.5, 4.15], // wall unit
    [3.25, -5, 5.65, -4.0], // fridges
    [3.95, -3.25, 5.65, -2.25], // freezer
    [-6.5, -5, 2.95, -4.5], // back shelves
    [-6.5, -4.5, -0.35, -2.4], // counter and the till side behind it
    [-5.9, 2.75, -4.65, 4.15], // crates
    [-5.45, -0.3, -4.85, 0.65], // baskets
    sq(4.6, 1.8, 0.3), // Kelvin
  ],
  start: [2.05, 4.5],
  spots: foodSpots([], ORDER_AT),
  tapBoxes: {},
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 1.9,
  speed: 2.4,
}

export const DUBLOUS_PLACE: FoodPlace = {
  name: 'Dublous',
  icon: '🛒',
  layout: DUBLOUS,
  seats: [],
  npcs: NPCS,
  greeter: 'db-cashier',
  greeting: 'Sorry o, everything is out of stock. New goods are coming soon!',
  orderNote: 'Out of stock for now',
  soldOut: true,
}

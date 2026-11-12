import type { RoomLayout } from './room-layouts'

/*
 * Magmus Autos showroom (scripts/blender/magmus-autos.py → public/models/magmus-autos.glb).
 * Room x −10…10, z −7…7; walls on +x and −z. The cars are drawn by the game on these bays, in
 * catalogue order (cheapest three out front by the door, the dearer four at the back under the lights).
 */
export type AutosBay = { x: number; z: number; rot: number }

export const AUTOS_BAYS: AutosBay[] = [
  { x: -6, z: 3.6, rot: 0.35 },
  { x: -1, z: 3.6, rot: 0.35 },
  { x: 4, z: 3.6, rot: 0.35 },
  { x: -7, z: -3.8, rot: 0 },
  { x: -3, z: -3.8, rot: 0 },
  { x: 1, z: -3.8, rot: 0 },
  { x: 5, z: -3.8, rot: 0 },
]

export const AUTOS: RoomLayout = {
  id: 'office',
  label: 'Magmus Autos',
  glb: '/models/magmus-autos.glb?v=3',
  floors: [[-9.8, -6.8, 9.8, 6.8]],
  blocks: [
    ...AUTOS_BAYS.map((b): [number, number, number, number] => [b.x - 1.6, b.z - 2.9, b.x + 1.6, b.z + 2.9]),
    [8.0, -1.1, 9.8, 1.5], // sales desk
    [7.0, -0.8, 7.6, 1.2], // visitor chairs
  ],
  start: [8.4, 5.2],
  spots: {},
  tapBoxes: {},
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 3.5,
  speed: 2.6,
}

/*
 * Where people sit in each car (metres, car frame: front +z, left +x: Nigeria drives on the right,
 * so the driver is on the left of the car, +x). One row per id in CARS (lib/game/cars-rules.ts).
 * `seat` is where a seated figure's origin goes; `scale` sizes the figure to the cabin.
 * `passenger` is the front-left… no: the front seat opposite the driver (not used yet:
 * Gigs Driver jobs will seat a rider there). `door` is the driver's door slab that swings
 * open when getting in/out ([hinge z, length, bottom y, top y]); null when the model has no separate door.
 */
export type CarSeat = {
  driver: [number, number, number]
  passenger: [number, number, number]
  scale: number
  /** Steering wheel centre: [x, y, z]. */
  wheel: [number, number, number]
  door: [number, number, number, number] | null
  /** Half the body width: where the door stands. */
  half: number
}

const row = (x: number, y: number, z: number, scale: number, wheelZ: number, wheelY: number, half: number, door: CarSeat['door']): CarSeat => ({
  driver: [x, y, z],
  passenger: [-x, y, z],
  scale,
  wheel: [x, wheelY, wheelZ],
  door,
  half,
})

export const CAR_SEATS: Record<string, CarSeat> = {
  corolla: row(0.4, 0.3, -0.4, 0.6, 0.12, 0.92, 0.86, [0.85, 1.0, 0.45, 0.98]),
  camry: row(0.42, 0.3, -0.45, 0.6, 0.1, 0.92, 0.92, [0.9, 1.05, 0.45, 1.02]),
  es350: row(0.43, 0.3, -0.45, 0.6, 0.05, 0.94, 0.935, [0.85, 1.1, 0.45, 1.02]),
  gle43: row(0.46, 0.5, -0.4, 0.64, 0.12, 1.2, 1.0, [0.9, 1.05, 0.6, 1.35]),
  rx350: row(0.44, 0.48, -0.35, 0.64, 0.15, 1.15, 0.94, null),
  gla: row(0.43, 0.42, -0.35, 0.62, 0.15, 1.08, 0.9, null),
  scout: row(0.4, 0.35, -0.2, 0.6, 0.3, 1.0, 0.85, null),
  suv: row(0.45, 0.45, -0.3, 0.64, 0.3, 1.15, 0.95, null),
  gt3: row(0.38, 0.0, -0.2, 0.46, 0.35, 0.7, 0.95, null),
}

const FALLBACK = CAR_SEATS.corolla!
export const seatFor = (model: string): CarSeat => CAR_SEATS[model] ?? FALLBACK

import { HOME_TILE } from './home-grid'

/*
 * Where the character sits, lies or stands on each furniture model. One entry per model file,
 * measured from the model's own geometry (scripts/models/height-map.mjs prints the surface
 * heights; scripts/models/dump-bounds.mjs the part boxes). Numbers are metres in the piece's own
 * frame as the game draws it: centred on its tiles, floor at y = 0, turn 0 (front toward +z).
 * Rotating or finishing a piece never changes them; `seatsFor` turns them into world spots.
 */

/** From the character's origin (its feet) up to where it sits: seat top − HIP = standing y. */
export const HIP = 0.7
/** Standing figure is ~1.7 m tall; lying, its origin (feet) is this far along the bed from the middle of the body. */
export const LIE_HALF = 0.85
/** A lying body is ~0.28 m thick, so its centre rides this far above the mattress/duvet. */
export const LIE_RISE = 0.09

export type SeatKind = 'sit' | 'lie' | 'stand'

export type SeatSpec = {
  /** Where the body is, in the piece's frame (x right, z toward the front). */
  x: number
  z: number
  /** Height of the surface the body rests on (seat top, mattress top); 0 for standing. */
  top: number
  /** Which way the body faces/heads, relative to the model's front (+z): radians, turning like a heading. */
  turn?: number
}

export type ModelSeats = { kind: SeatKind; seats: SeatSpec[] }

const sit = (seats: SeatSpec[]): ModelSeats => ({ kind: 'sit', seats })
const one = (x: number, z: number, top: number, turn = 0): SeatSpec => ({ x, z, top, turn })
const HALF_PI = Math.PI / 2

const K = '/models/furniture/kenney/'
const P = '/models/furniture/pro/'

export const MODEL_SEATS: Record<string, ModelSeats> = {
  // —— Sofas: backrest at −z, seat cushions toward +z ——
  [`${P}sofa-two.glb`]: sit([one(-0.4, 0.17, 0.46), one(0.4, 0.17, 0.46)]),
  [`${P}sofa-designer.glb`]: sit([one(-0.48, 0.12, 0.57), one(0.48, 0.12, 0.57)]),
  [`${P}sofa-chaise.glb`]: sit([one(-0.62, 0.27, 0.63), one(0, 0.27, 0.63), one(0.62, 0.27, 0.63)]),
  // L-shaped: backs along −z and +x; two seats on the long side, two facing −x on the short side
  [`${K}loungeSofaCorner.glb`]: sit([
    one(-0.55, -0.42, 0.52),
    one(-0.1, -0.42, 0.52),
    one(0.38, 0.1, 0.52, -HALF_PI),
    one(0.38, 0.6, 0.52, -HALF_PI),
  ]),
  // —— Armchairs ——
  [`${P}armchair.glb`]: sit([one(0, 0.15, 0.57)]),
  // Back is at −x: this model faces +x
  [`${P}lounge-chair.glb`]: sit([one(0.25, 0, 0.55, HALF_PI)]),
  // —— Chairs, stools ——
  [`${P}dining-chair.glb`]: sit([one(0.08, 0, 0.51, HALF_PI)]),
  [`${K}chairCushion.glb`]: sit([one(0, 0.04, 0.48)]),
  [`${K}chairDesk.glb`]: sit([one(0, 0.04, 0.35)]),
  [`${P}pouffe.glb`]: sit([one(0, 0, 0.66)]),
  // —— Toilets: tank at the back (−z), sit facing the front ——
  [`${K}toilet.glb`]: sit([one(0, 0.08, 0.29)]),
  [`${K}toiletSquare.glb`]: sit([one(0, 0.07, 0.3)]),
  // —— Beds: head at −z. `z` is the middle of the body; `top` is the mattress/duvet it rests on ——
  [`${P}bed-vono-double.glb`]: { kind: 'lie', seats: [one(-0.4, -0.15, 0.68)] },
  [`${P}bed-vono-single.glb`]: { kind: 'lie', seats: [one(0, -0.25, 0.73)] },
  // Bottom bunk (the top one is out of reach)
  [`${K}bedBunk.glb`]: { kind: 'lie', seats: [one(0, 0, 0.26)] },
  // —— Cookers: stand in front of the hob, face it ——
  [`${P}cooker-gas.glb`]: { kind: 'stand', seats: [one(0, 0.66, 0, Math.PI)] },
  [`${K}kitchenStoveElectric.glb`]: { kind: 'stand', seats: [one(0, 0.62, 0, Math.PI)] },
}

export type SeatPose = {
  /** Where the character's origin goes: [x, y, z] in the room. */
  at: [number, number, number]
  /** Character yaw (radians): 0 faces +z; for lying, 0 puts the head toward −z. */
  heading: number
  /** Where this seat is on the floor (centre of the body), for choosing a side to walk up to. */
  floor: [number, number]
}

/** A point in the piece's frame, turned by a quarter-turn `rot` (the game's rotation, 0/90/180/270) about its centre. */
export function turnPoint(rot: number, x: number, z: number): [number, number] {
  const a = (-rot * Math.PI) / 180
  const c = Math.round(Math.cos(a) * 1e6) / 1e6
  const s = Math.round(Math.sin(a) * 1e6) / 1e6
  return [x * c + z * s, -x * s + z * c]
}

/** Every seat of a model on a piece at `centre`, turned `rot` degrees; null if the model has none on record. */
export function seatsFor(model: string | null | undefined, centre: [number, number], rot: number): { kind: SeatKind; seats: SeatPose[] } | null {
  const data = model ? MODEL_SEATS[model] : undefined
  if (!data) return null
  const yaw = (-rot * Math.PI) / 180
  const seats = data.seats.map((seat): SeatPose => {
    const heading = yaw + (seat.turn ?? 0)
    const [dx, dz] = turnPoint(rot, seat.x, seat.z)
    const cx = centre[0] + dx
    const cz = centre[1] + dz
    if (data.kind === 'lie') {
      // The origin is at the feet: half a body length behind the middle, away from the head
      return {
        at: [cx + Math.sin(heading) * LIE_HALF, seat.top + LIE_RISE, cz + Math.cos(heading) * LIE_HALF],
        heading,
        floor: [cx, cz],
      }
    }
    return { at: [cx, data.kind === 'sit' ? seat.top - HIP : 0, cz], heading, floor: [cx, cz] }
  })
  return { kind: data.kind, seats }
}

/** Keys of the extra seats of one piece: the first seat keeps the piece's own key. */
export const seatSuffix = (index: number) => (index === 0 ? '' : `#${index}`)

/** Half-size of the tap box around one seat of a multi-seat piece (m). */
export const SEAT_TAP = HOME_TILE / 2

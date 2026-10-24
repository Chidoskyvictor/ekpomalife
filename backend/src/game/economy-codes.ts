/** Machine error codes returned in `{ ok: false, error }` for Phase 2 economy. */
export const INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS'
export const NO_ENERGY = 'NO_ENERGY'
export const NOT_ELIGIBLE = 'NOT_ELIGIBLE'
export const VERSION_CONFLICT = 'VERSION_CONFLICT'
export const NO_PHONE = 'NO_PHONE'
export const BAD_BUNDLE = 'BAD_BUNDLE'
export const NOT_AT_HOSTEL = 'NOT_AT_HOSTEL'
export const BATTERY_DEAD = 'BATTERY_DEAD'
export const SAME_PLACE = 'SAME_PLACE'
export const BAD_PLACE = 'BAD_PLACE'
export const CLOSED = 'CLOSED'
export { SETUP_INCOMPLETE } from './setup-status.js'

/** Friendly phone / ride copy — never shaming. */
export const PHONE_ERROR_COPY: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'Not enough cash for this one — a shift at work go sort am',
  NO_PHONE: 'Buy a phone at Campus Shop first.',
  BAD_BUNDLE: 'That data bundle does not exist.',
  NOT_AT_HOSTEL: 'You fit only charge for hostel.',
  BATTERY_DEAD: 'Your phone is dead. Charge it at your hostel.',
  SAME_PLACE: 'You are already here.',
  BAD_PLACE: 'That place is not on the map.',
  CLOSED: 'Kekes have closed for today. Walk or wait till morning.',
}

import type { RoomErrorCode } from './room-types.js'

/** Friendly copy — server sends it; client shows it word for word. */
export const ROOM_ERROR_COPY: Partial<Record<RoomErrorCode, string>> & Record<string, string> = {
  INSUFFICIENT_FUNDS: "Small shortfall — a couple of shifts and it's yours.",
  TIER_LOCKED: 'This one needs a bigger room. Upgrade your lodge to unlock it.',
  OVERLAP: "Something's already there. Try another spot.",
  OUT_OF_BOUNDS: "That's past the wall.",
  TOO_MANY: 'Your room is full of that one already.',
  VERSION_CONFLICT: 'Your room changed on another device. We loaded the latest.',
  UNKNOWN_ITEM: 'That furniture is gone.',
  NOT_OWNED: 'That piece is not in your room.',
  BAD_ROTATION: 'That angle will not work.',
  WALL_ONLY_BACK: 'Hang that on the back wall.',
  BAD_COLOR: 'Pick a colour from the palette.',
  FLOOR_LOCKED: 'That floor needs a bigger lodge.',
  IDEMPOTENCY_CONFLICT: 'This request does not match the first attempt.',
  IDEMPOTENCY_KEY_REQUIRED: 'Idempotency-Key header required.',
  CANT_SELL_STARTER: 'Your starter mattress stays with you.',
  VISITS_DISABLED: 'Room visits come with friends — soon!',
  SETUP_INCOMPLETE: 'SETUP_INCOMPLETE',
}

export function roomFail(
  code: RoomErrorCode | string,
  uid?: string,
): { ok: false; error: string; code: string; uid?: string; http: number } {
  const error = ROOM_ERROR_COPY[code] ?? code
  const http =
    code === 'TIER_LOCKED' || code === 'FLOOR_LOCKED' || code === 'VISITS_DISABLED'
      ? 403
      : code === 'UNKNOWN_ITEM'
        ? 404
        : code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT'
          ? 409
          : code === 'SETUP_INCOMPLETE'
            ? 409
            : 400
  return uid ? { ok: false, error, code, uid, http } : { ok: false, error, code, http }
}

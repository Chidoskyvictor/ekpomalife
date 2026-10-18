/** Machine error codes returned in `{ ok: false, error }` for Phase 2 economy. */
export const INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS'
export const NO_ENERGY = 'NO_ENERGY'
export const NOT_ELIGIBLE = 'NOT_ELIGIBLE'
export const VERSION_CONFLICT = 'VERSION_CONFLICT'
export { SETUP_INCOMPLETE } from './setup-status.js'

import type { RoomErrorCode } from './room-types.js'

/** Friendly copy — server sends it; client shows it word for word. */
export const ROOM_ERROR_COPY: Partial<Record<RoomErrorCode, string>> & Record<string, string> = {
  INSUFFICIENT_FUNDS: "Small shortfall — a couple of shifts and it's yours.",
  TIER_LOCKED: 'This one needs a bigger room. Upgrade your lodge to unlock it.',
  OVERLAP: "Something's already there. Try another spot.",
  OUT_OF_BOUNDS: "That's past the wall, my guy.",
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

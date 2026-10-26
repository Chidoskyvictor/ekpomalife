import { pool } from '../db.js'
import { BAD_PLACE, PHONE_ERROR_COPY, SAME_PLACE } from './economy-codes.js'
import { requireEconomySetup } from './economy.js'
import { getPublicState } from './game-state.js'
import { RIDE_BASE, RIDE_PER_HOP } from './phone.js'
import { getPlace, hopDistance, PLACE_UV, PLACES, startPlaceForLodging } from './places.js'

/*
 * "Where to?" — every campus place with how long it takes to get there. Trek is free and
 * handled here; keke and okada go through POST /ride, which charges the fare.
 */

/** Places this many hops away or closer are "nearby": the picker shows a walk time. */
export const NEAR_HOPS = 2

/** Minutes on the in-game map (display only; the real clock doesn't move). */
export const TRAVEL_MINUTES = {
  trek: (hops: number) => 4 + hops * 5,
  keke: (hops: number) => 3 + hops * 2,
  okada: (hops: number) => 2 + hops,
}

export type TravelOption = {
  id: string
  label: string
  type: string
  hops: number
  /** Rough spot on the campus map (0…1), for the trip screen */
  uv: { u: number; v: number }
  near: boolean
  /** Your street (where your house is) */
  home: boolean
  minutes: { trek: number; keke: number; okada: number }
  fares: { keke: number; okada: number }
}

export function travelOptions(fromPlaceId: string, homePlaceId: string): TravelOption[] {
  const options: TravelOption[] = []
  for (const place of PLACES) {
    // Home stays on the list even when you're on its block (hops 0: just walk to your gate)
    if ((place.id === fromPlaceId && place.id !== homePlaceId) || !PLACE_UV[place.id]) continue
    const hops = hopDistance(fromPlaceId, place.id) ?? 1
    options.push({
      id: place.id,
      label: place.label,
      type: place.type,
      hops,
      uv: PLACE_UV[place.id],
      near: hops <= NEAR_HOPS,
      home: place.id === homePlaceId,
      minutes: {
        trek: TRAVEL_MINUTES.trek(hops),
        keke: TRAVEL_MINUTES.keke(hops),
        okada: TRAVEL_MINUTES.okada(hops),
      },
      fares: {
        keke: RIDE_BASE.keke + RIDE_PER_HOP.keke * hops,
        okada: RIDE_BASE.okada + RIDE_PER_HOP.okada * hops,
      },
    })
  }
  // Home first, then nearest
  return options.sort((a, b) => Number(b.home) - Number(a.home) || a.hops - b.hops || a.label.localeCompare(b.label))
}

export async function getTravelOptions(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const found = await pool.query<{ location_id: string }>(
    `SELECT location_id FROM game_state WHERE character_id = $1`,
    [gate.character.id],
  )
  const homePlaceId = startPlaceForLodging(gate.character.lodging_id)
  const from = found.rows[0]?.location_id ?? homePlaceId
  return {
    ok: true as const,
    from,
    fromLabel: getPlace(from)?.label ?? 'Campus',
    fromUv: PLACE_UV[from] ?? { u: 0.5, v: 0.5 },
    homePlaceId,
    places: travelOptions(from, homePlaceId),
  }
}

/** Walk there: free, just moves you. */
export async function trek(userId: string, toPlaceId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const dest = getPlace(toPlaceId)
  if (!dest || !PLACE_UV[dest.id]) {
    return { ok: false as const, error: PHONE_ERROR_COPY.BAD_PLACE, code: BAD_PLACE, status: 400 }
  }

  const client = await pool.connect()
  let hops = 1
  try {
    await client.query('BEGIN')
    const found = await client.query<{ location_id: string }>(
      `SELECT location_id FROM game_state WHERE character_id = $1 FOR UPDATE`,
      [gate.character.id],
    )
    const from = found.rows[0]?.location_id
    if (!from) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'Load the game first.', code: BAD_PLACE, status: 409 }
    }
    if (from === dest.id) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: PHONE_ERROR_COPY.SAME_PLACE, code: SAME_PLACE, status: 400 }
    }
    hops = hopDistance(from, dest.id) ?? 1
    await client.query(
      `UPDATE game_state SET location_id = $2, version = version + 1, updated_at = NOW()
       WHERE character_id = $1`,
      [gate.character.id, dest.id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const state = await getPublicState(userId)
  if (!state.ok) return state
  return {
    ok: true as const,
    message: `Trekked to ${dest.label}`,
    minutes: TRAVEL_MINUTES.trek(hops),
    state: state.state,
  }
}

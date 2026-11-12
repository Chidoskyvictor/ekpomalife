import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { applyCash, asMoney, ensureGameState, getPublicState } from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { requireEconomySetup } from './economy.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import { CARS, MAX_DENTS, PARKING_PRICE, carById, carSellBack, dentFixPrice, isPaint, needsParking } from './cars-rules.js'
import { placeLock } from './place-locks.js'
import { getPlace, PLACE_UV, startPlaceForLodging } from './places.js'

/*
 * Magmus Autos: buy a car, pick the one you drive, repaint it (free), sell it back at 60%.
 * Homes without parking need a one-time ₦500k parking space first (or bought with the car).
 */

/** `place`: where it was left (null = at home); `x`/`z`: the exact spot on the map. */
export type OwnedCar = { id: string; model: string; color: string; paid: number; active: boolean; dents: number; place: string | null; x: number | null; z: number | null }

type CarRow = { id: string; model: string; color: string; bought_price: string | number; active: boolean; dents: number; parked_place?: string | null; parked_x?: number | null; parked_z?: number | null }

async function loadCars(db: Pick<PoolClient, 'query'>, characterId: string): Promise<OwnedCar[]> {
  const { rows } = await db.query<CarRow>(
    `SELECT id, model, color, bought_price, active, dents, parked_place, parked_x, parked_z FROM car_holdings WHERE character_id = $1 ORDER BY created_at`,
    [characterId],
  )
  return rows.map((r) => ({ id: r.id, model: r.model, color: r.color, paid: asMoney(r.bought_price), active: r.active, dents: r.dents, place: r.parked_place ?? null, x: r.parked_x ?? null, z: r.parked_z ?? null }))
}

async function hasSpace(db: Pick<PoolClient, 'query'>, characterId: string) {
  const { rows } = await db.query(`SELECT 1 FROM parking_spaces WHERE character_id = $1`, [characterId])
  return rows.length > 0
}

const fail = (error: string, code = 400, reason?: string) => ({ ok: false as const, error, code, reason })

export async function getGarage(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const [cars, space] = await Promise.all([loadCars(pool, gate.character.id), hasSpace(pool, gate.character.id)])
  return {
    ok: true as const,
    catalog: CARS,
    cars,
    parkingPrice: PARKING_PRICE,
    homePlaceId: startPlaceForLodging(gate.character.lodging_id),
    needsParking: needsParking(gate.character.lodging_id, space),
  }
}

type Ctx = { client: PoolClient; characterId: string; lodgingId: string | null }
const bad = (error: string, status = 400, reason?: string) => ({ status, body: { ok: false, error, reason } as Record<string, unknown> })

/** One garage write in a transaction: idempotent, one writer per character. */
async function writeGarage(
  userId: string,
  idemKey: string,
  route: string,
  body: unknown,
  moneyMoves: boolean,
  run: (ctx: Ctx) => Promise<{ status: number; body: Record<string, unknown> }>,
) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })
    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idemKey,
      route,
      body,
      run: async () => {
        if (moneyMoves) {
          const inSpace = await liveSpaceMoneyBlock([userId], client)
          if (inSpace) return bad(inSpace, 400, 'LIVE_SPACE')
        }
        await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [gate.character.id])
        return run({ client, characterId: gate.character.id, lodgingId: gate.character.lodging_id })
      },
    })
    await client.query('COMMIT')
    const out = result.body as Record<string, unknown>
    if (out.ok !== true) return fail((out.error as string) ?? 'Request failed.', result.status, out.reason as string | undefined)
    const pub = await getPublicState(userId)
    if (!pub.ok) return pub
    const space = await hasSpace(pool, gate.character.id)
    return {
      ok: true as const,
      ...out,
      cars: await loadCars(pool, gate.character.id),
      needsParking: needsParking(gate.character.lodging_id, space),
      state: { ok: true as const, ...pub.state },
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

/** Buy a car; `withParking` also buys the parking space in the same charge when the home needs one. */
export function buyCar(userId: string, modelId: string, withParking: boolean, idemKey: string) {
  return writeGarage(userId, idemKey, 'POST /cars/buy', { modelId, withParking }, true, async ({ client, characterId, lodgingId }) => {
    const car = carById(modelId)
    if (!car) return bad('That car is not sold here.', 404, 'UNKNOWN_CAR')
    const mustPark = needsParking(lodgingId, await hasSpace(client, characterId))
    if (mustPark && !withParking) return bad('You need a parking space first.', 400, 'NEEDS_PARKING')
    const total = car.price + (mustPark ? PARKING_PRICE : 0)
    const wrote = await applyCash(client, characterId, -total, mustPark ? `Bought a ${car.name} + parking space` : `Bought a ${car.name}`, 'purchase')
    if (!wrote.ok) return bad('Not enough naira for that.', 400, 'INSUFFICIENT_FUNDS')
    if (mustPark) await client.query(`INSERT INTO parking_spaces (character_id, paid) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [characterId, PARKING_PRICE])
    const { rows } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM car_holdings WHERE character_id = $1 AND active`, [characterId])
    const id = `car_${createId()}`
    await client.query(
      `INSERT INTO car_holdings (id, character_id, model, color, bought_price, active) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, characterId, car.id, car.color, car.price, (rows[0]?.n ?? 0) === 0],
    )
    return { status: 200, body: { ok: true, carId: id, message: `${car.name} is yours! Paid ${naira(total)}.` } }
  })
}

export function buyParking(userId: string, idemKey: string) {
  return writeGarage(userId, idemKey, 'POST /cars/parking', {}, true, async ({ client, characterId, lodgingId }) => {
    if (!needsParking(lodgingId, await hasSpace(client, characterId))) return bad('You already have parking.', 400, 'HAS_PARKING')
    const wrote = await applyCash(client, characterId, -PARKING_PRICE, 'Bought a parking space', 'purchase')
    if (!wrote.ok) return bad('Not enough naira for that.', 400, 'INSUFFICIENT_FUNDS')
    await client.query(`INSERT INTO parking_spaces (character_id, paid) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [characterId, PARKING_PRICE])
    return { status: 200, body: { ok: true, message: `Parking space bought for ${naira(PARKING_PRICE)}.` } }
  })
}

export function driveCar(userId: string, carId: string, idemKey: string) {
  return writeGarage(userId, idemKey, 'POST /cars/drive', { carId }, false, async ({ client, characterId }) => {
    const { rowCount } = await client.query(`SELECT 1 FROM car_holdings WHERE id = $1 AND character_id = $2`, [carId, characterId])
    if (!rowCount) return bad('That car is not yours.', 404)
    await client.query(`UPDATE car_holdings SET active = (id = $1) WHERE character_id = $2`, [carId, characterId])
    return { status: 200, body: { ok: true, message: 'Keys in your pocket.' } }
  })
}

export function paintCar(userId: string, carId: string, color: string, idemKey: string) {
  return writeGarage(userId, idemKey, 'POST /cars/paint', { carId, color }, false, async ({ client, characterId }) => {
    if (!isPaint(color)) return bad('That colour is not sold.', 400, 'UNKNOWN_PAINT')
    const { rowCount } = await client.query(`UPDATE car_holdings SET color = $3 WHERE id = $1 AND character_id = $2`, [carId, characterId, color.toLowerCase()])
    if (!rowCount) return bad('That car is not yours.', 404)
    return { status: 200, body: { ok: true, message: 'Fresh paint!' } }
  })
}

export function sellCar(userId: string, carId: string, idemKey: string) {
  return writeGarage(userId, idemKey, 'POST /cars/sell', { carId }, true, async ({ client, characterId }) => {
    const { rows } = await client.query<CarRow>(
      `DELETE FROM car_holdings WHERE id = $1 AND character_id = $2 RETURNING id, model, color, bought_price, active, dents`,
      [carId, characterId],
    )
    const row = rows[0]
    if (!row) return bad('That car is not yours.', 404)
    const refunded = carSellBack(asMoney(row.bought_price))
    const name = carById(row.model)?.name ?? 'car'
    const wrote = await applyCash(client, characterId, refunded, `Sold your ${name} to Magmus Autos`, 'refund')
    if (!wrote.ok) return bad('Could not pay you for that.', 400)
    // Still have cars but sold the one you drove: the oldest becomes the active one
    if (row.active) {
      await client.query(
        `UPDATE car_holdings SET active = TRUE WHERE id = (SELECT id FROM car_holdings WHERE character_id = $1 ORDER BY created_at LIMIT 1)`,
        [characterId],
      )
    }
    return { status: 200, body: { ok: true, refunded, message: `Sold for ${naira(refunded)}.` } }
  })
}

/** The mechanic at Magmus Autos knocks every dent out for 2% of what the car cost. */
export function fixCar(userId: string, carId: string, idemKey: string) {
  return writeGarage(userId, idemKey, 'POST /cars/fix', { carId }, true, async ({ client, characterId }) => {
    const at = await client.query<{ location_id: string | null }>(`SELECT location_id FROM game_state WHERE character_id = $1`, [characterId])
    if (at.rows[0]?.location_id !== 'magmus-autos') return bad('Bring the car to Magmus Autos to fix it.', 400, 'NOT_AT_MECHANIC')
    const { rows } = await client.query<CarRow>(
      `SELECT id, model, color, bought_price, active, dents FROM car_holdings WHERE id = $1 AND character_id = $2 FOR UPDATE`,
      [carId, characterId],
    )
    const row = rows[0]
    if (!row) return bad('That car is not yours.', 404)
    if (row.dents <= 0) return bad('No dents to fix.', 400, 'NO_DENTS')
    const price = dentFixPrice(asMoney(row.bought_price))
    const wrote = await applyCash(client, characterId, -price, `Mechanic fixed your ${carById(row.model)?.name ?? 'car'}`, 'purchase')
    if (!wrote.ok) return bad('Not enough naira for the mechanic.', 400, 'INSUFFICIENT_FUNDS')
    await client.query(`UPDATE car_holdings SET dents = 0 WHERE id = $1`, [carId])
    return { status: 200, body: { ok: true, message: `Good as new. Paid ${naira(price)}.` } }
  })
}

/**
 * Park the car you drive at a place: you get out there (your location moves, free) and the car
 * stays on that spot. `dents` is how many hard hits this drive added.
 */
export async function parkCar(userId: string, placeId: string, x: number, z: number, dents: number) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const dest = getPlace(placeId)
  if (!dest || !PLACE_UV[dest.id]) return fail('You cannot park there.', 400, 'BAD_PLACE')
  const locked = placeLock(dest.id)
  if (locked) return fail(locked, 400, 'LOCKED')
  const home = startPlaceForLodging(gate.character.lodging_id)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [gate.character.id])
    const car = await client.query<{ id: string }>(`SELECT id FROM car_holdings WHERE character_id = $1 AND active FOR UPDATE`, [gate.character.id])
    if (!car.rows[0]) {
      await client.query('ROLLBACK')
      return fail('You have no car to park.', 400, 'NO_CAR')
    }
    // Parked at home = back under the carport
    await client.query(
      `UPDATE car_holdings SET parked_place = $2, parked_x = $3, parked_z = $4, dents = LEAST($6, dents + $5) WHERE id = $1`,
      [car.rows[0].id, dest.id === home ? null : dest.id, x, z, dents, MAX_DENTS],
    )
    await client.query(
      `UPDATE game_state SET location_id = $2, version = version + 1, updated_at = NOW() WHERE character_id = $1 AND location_id IS DISTINCT FROM $2`,
      [gate.character.id, dest.id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  const pub = await getPublicState(userId)
  if (!pub.ok) return pub
  return {
    ok: true as const,
    message: `Parked at ${dest.label}.`,
    cars: await loadCars(pool, gate.character.id),
    needsParking: needsParking(gate.character.lodging_id, await hasSpace(pool, gate.character.id)),
    state: { ok: true as const, ...pub.state },
  }
}

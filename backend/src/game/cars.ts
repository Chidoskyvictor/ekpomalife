import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { applyCash, asMoney, ensureGameState, getPublicState } from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { requireEconomySetup } from './economy.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import { CARS, PARKING_PRICE, carById, carSellBack, isPaint, needsParking } from './cars-rules.js'

/*
 * Magmus Autos: buy a car, pick the one you drive, repaint it (free), sell it back at 60%.
 * Homes without parking need a one-time ₦500k parking space first (or bought with the car).
 */

export type OwnedCar = { id: string; model: string; color: string; paid: number; active: boolean; dents: number }

type CarRow = { id: string; model: string; color: string; bought_price: string | number; active: boolean; dents: number }

async function loadCars(db: Pick<PoolClient, 'query'>, characterId: string): Promise<OwnedCar[]> {
  const { rows } = await db.query<CarRow>(
    `SELECT id, model, color, bought_price, active, dents FROM car_holdings WHERE character_id = $1 ORDER BY created_at`,
    [characterId],
  )
  return rows.map((r) => ({ id: r.id, model: r.model, color: r.color, paid: asMoney(r.bought_price), active: r.active, dents: r.dents }))
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

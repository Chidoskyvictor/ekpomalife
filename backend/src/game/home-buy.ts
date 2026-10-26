import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { env } from '../env.js'
import { applyCash, asMoney, ensureGameState, getPublicState } from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { normalizeLodgingId } from './lodging.js'
import { requireEconomySetup } from './economy.js'
import { HOME_GRID } from './home-grid.js'
import {
  checkHomePlacement,
  sellBackPrice,
  type HomeRotation,
  type HomeShape,
} from './home-buy-rules.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'

/*
 * Buy mode: furniture bought with in-game naira and placed on the tile grid of your own home
 * (single room, self-con, one bedroom). Rules live in home-buy-rules.ts (shared with the game).
 */

export type HomeItem = {
  id: string
  name: string
  emoji: string
  category: string
  price: number
  w: number
  d: number
  wall: boolean
  height: number
  color: string
  helps: string[]
  uses: string | null
  maxPerHome: number
}

type ItemRow = {
  id: string
  name: string
  emoji: string
  category: string
  price: string | number
  w: number
  d: number
  wall: boolean
  height: number
  color: string
  helps: string[]
  uses: string | null
  max_per_home: number
}

type PlacementRow = { id: string; item_id: string; x: number; z: number; rot: number; paid: string | number }

export type HomeBuyFail = { ok: false; error: string; code: number; reason?: string }

function mapItem(row: ItemRow): HomeItem {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    category: row.category,
    price: asMoney(row.price),
    w: row.w,
    d: row.d,
    wall: row.wall,
    height: Number(row.height),
    color: row.color,
    helps: row.helps ?? [],
    uses: row.uses,
    maxPerHome: row.max_per_home,
  }
}

async function loadCatalog(db: Pick<PoolClient, 'query'>): Promise<HomeItem[]> {
  const rows = await db.query<ItemRow>(`SELECT * FROM home_furniture ORDER BY sort ASC, id ASC`)
  return rows.rows.map(mapItem)
}

const shapesOf = (catalog: HomeItem[]) =>
  new Map<string, HomeShape>(
    catalog.map((i) => [i.id, { id: i.id, w: i.w, d: i.d, wall: i.wall, maxPerHome: i.maxPerHome }]),
  )

async function loadPlacements(db: Pick<PoolClient, 'query'>, characterId: string) {
  const rows = await db.query<PlacementRow>(
    `SELECT id, item_id, x, z, rot, paid FROM home_placements WHERE character_id = $1 ORDER BY created_at ASC, id ASC`,
    [characterId],
  )
  return rows.rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    x: r.x,
    z: r.z,
    rot: r.rot as HomeRotation,
    paid: asMoney(r.paid),
  }))
}

/** Hostel bunks are not yours to rearrange; the other homes have a grid. */
function specFor(lodgingId: string | null) {
  return HOME_GRID[normalizeLodgingId(lodgingId)] ?? null
}

const NO_GRID = 'Your hostel bunk can’t be decorated. Move to your own place first.'

function fail(error: string, code = 400, reason?: string): HomeBuyFail {
  return { ok: false, error, code, reason }
}

export async function getHomeBuy(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const spec = specFor(gate.character.lodging_id)
  const catalog = await loadCatalog(pool)
  const placements = await loadPlacements(pool, gate.character.id)
  return {
    ok: true as const,
    enabled: spec !== null,
    lodgingId: normalizeLodgingId(gate.character.lodging_id),
    catalog,
    placements,
  }
}

/** What's placed in someone's home (yours, or a visit when visits are on). */
export async function getHomePlacements(viewerId: string, username: string) {
  const gate = await requireEconomySetup(viewerId)
  if (!gate.ok) return gate
  const target = await pool.query<{ user_id: string; character_id: string }>(
    `SELECT u.id AS user_id, c.id AS character_id
     FROM users u JOIN characters c ON c.user_id = u.id
     WHERE LOWER(u.username) = LOWER($1)`,
    [username],
  )
  const row = target.rows[0]
  if (!row) return fail('Player not found.', 404)
  if (row.user_id !== viewerId && !env.ROOM_VISITS_ENABLED) return fail('Visits are switched off for now.', 403)
  const [catalog, placements] = await Promise.all([loadCatalog(pool), loadPlacements(pool, row.character_id)])
  return { ok: true as const, catalog, placements }
}

type Spot = { x: number; z: number; rot: HomeRotation }

type Ctx = {
  client: PoolClient
  characterId: string
  spec: NonNullable<ReturnType<typeof specFor>>
  catalog: HomeItem[]
}

/** Runs one Buy-mode write in a transaction: idempotent, serialized per character on its game_state row. */
async function writeHome(
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
        const spec = specFor(gate.character.lodging_id)
        if (!spec) return { status: 400, body: { ok: false, error: NO_GRID } }
        if (moneyMoves) {
          const inSpace = await liveSpaceMoneyBlock([userId], client)
          if (inSpace) return { status: 400, body: { ok: false, error: inSpace, reason: 'LIVE_SPACE' } }
        }
        // One writer at a time per character (also what applyCash locks on)
        await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [gate.character.id])
        const catalog = await loadCatalog(client)
        return run({ client, characterId: gate.character.id, spec, catalog })
      },
    })
    await client.query('COMMIT')
    const out = result.body as Record<string, unknown>
    if (out.ok !== true) {
      return fail((out.error as string) ?? 'Request failed.', result.status, out.reason as string | undefined)
    }
    const pub = await getPublicState(userId)
    if (!pub.ok) return pub
    return { ok: true as const, ...out, state: { ok: true as const, ...pub.state } }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const bad = (error: string, status = 400, reason?: string) => ({ status, body: { ok: false, error, reason } })

/** Buy and place in one go: balance, free tiles, cash out, placement saved, all or nothing. */
export function placeHomeItem(userId: string, itemId: string, spot: Spot, idemKey: string) {
  return writeHome(userId, idemKey, 'POST /home/place', { itemId, ...spot }, true, async ({ client, characterId, spec, catalog }) => {
    const item = catalog.find((i) => i.id === itemId)
    if (!item) return bad('That item is not sold.', 404, 'UNKNOWN_ITEM')
    const placements = await loadPlacements(client, characterId)
    const check = checkHomePlacement(spec, shapesOf(catalog), placements, itemId, spot)
    if (!check.ok) return bad(check.error, 400, check.code)
    if (item.price > 0) {
      const wrote = await applyCash(client, characterId, -item.price, `Bought ${item.name} for your home`, 'purchase')
      if (!wrote.ok) return bad('Not enough naira for that.', 400, 'INSUFFICIENT_FUNDS')
    }
    const id = `hp_${createId()}`
    await client.query(
      `INSERT INTO home_placements (id, character_id, item_id, x, z, rot, paid) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, characterId, itemId, spot.x, spot.z, spot.rot, item.price],
    )
    return {
      status: 200,
      body: { ok: true, placements: await loadPlacements(client, characterId), placedId: id, message: `${item.name} placed.` },
    }
  })
}

/** Move or turn something you already own (free). */
export function moveHomeItem(userId: string, id: string, spot: Spot, idemKey: string) {
  return writeHome(userId, idemKey, 'POST /home/move', { id, ...spot }, false, async ({ client, characterId, spec, catalog }) => {
    const placements = await loadPlacements(client, characterId)
    const mine = placements.find((p) => p.id === id)
    if (!mine) return bad('That is not in your home.', 404)
    const others = placements.filter((p) => p.id !== id)
    const check = checkHomePlacement(spec, shapesOf(catalog), others, mine.itemId, spot)
    if (!check.ok) return bad(check.error, 400, check.code)
    await client.query(`UPDATE home_placements SET x = $2, z = $3, rot = $4 WHERE id = $1`, [id, spot.x, spot.z, spot.rot])
    return { status: 200, body: { ok: true, placements: await loadPlacements(client, characterId), message: 'Moved.' } }
  })
}

/** Sell back for half of what you paid. */
export function sellHomeItem(userId: string, id: string, idemKey: string) {
  return writeHome(userId, idemKey, 'POST /home/sell', { id }, true, async ({ client, characterId, catalog }) => {
    const found = await client.query<PlacementRow>(
      `SELECT id, item_id, x, z, rot, paid FROM home_placements WHERE id = $1 AND character_id = $2 FOR UPDATE`,
      [id, characterId],
    )
    const row = found.rows[0]
    if (!row) return bad('That is not in your home.', 404)
    const item = catalog.find((i) => i.id === row.item_id)
    const refunded = sellBackPrice(asMoney(row.paid))
    if (refunded > 0) {
      const wrote = await applyCash(client, characterId, refunded, `Sold ${item?.name ?? 'furniture'}`, 'refund')
      if (!wrote.ok) return bad('Could not pay you for that.', 400)
    }
    await client.query(`DELETE FROM home_placements WHERE id = $1`, [id])
    return {
      status: 200,
      body: {
        ok: true,
        placements: await loadPlacements(client, characterId),
        refunded,
        message: `Sold for ₦${refunded.toLocaleString('en-NG')}.`,
      },
    }
  })
}

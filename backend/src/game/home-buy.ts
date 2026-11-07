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
  firstFreeHomeSpot,
  sellBackPrice,
  type HomeRotation,
  type HomeShape,
} from './home-buy-rules.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import { FIRST_STARTERS, STARTERS, starterSeedSpot, startersToAdd } from './home-starters.js'
import { cleanDecor, decorName, decorPrice, decorZones, type DecorZone } from './home-decor.js'

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
  /** Comes with the home (free, can be moved or removed, never sold in the shop) */
  starter: boolean
  /** Its 3D model (null = drawn as a block) */
  model: string | null
  /** For sale in the shop (block-only items aren't, but placed ones still show) */
  available: boolean
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
  starter: boolean | null
  model: string | null
  available: boolean | null
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
    starter: row.starter === true,
    model: row.model ?? null,
    available: row.available !== false,
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

/**
 * Give a player their home's starter furniture as placements, once per home. Moving house swaps
 * the old home's starter pieces for the new one's. Bought furniture is never touched.
 */
async function ensureStarters(characterId: string, lodgingId: string | null) {
  const key = normalizeLodgingId(lodgingId)
  const grid = HOME_GRID[key]
  const defs = STARTERS[key]
  if (!grid || !defs) return
  const seen = await pool.query<{ lodging_id: string; items: string[] | null }>(
    `SELECT lodging_id, items FROM home_starters WHERE character_id = $1`,
    [characterId],
  )
  if (seen.rows[0]?.lodging_id === key) {
    // Same home: only starters added since they were seeded (bath and kitchen pieces), if any
    const placed = await pool.query<{ item_id: string }>(
      `SELECT item_id FROM home_placements WHERE character_id = $1 AND item_id LIKE 'starter-%'`,
      [characterId],
    )
    if (startersToAdd(defs, seen.rows[0].items, placed.rows.map((r) => r.item_id)).length === 0) return
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query<{ lodging_id: string; items: string[] | null }>(
      `SELECT lodging_id, items FROM home_starters WHERE character_id = $1 FOR UPDATE`,
      [characterId],
    )
    if (locked.rows[0]?.lodging_id === key) {
      await addNewStarters(client, characterId, grid, defs, locked.rows[0].items)
      await client.query('COMMIT')
      return
    }
    await client.query(`DELETE FROM home_placements WHERE character_id = $1 AND item_id LIKE 'starter-%'`, [characterId])
    for (const def of defs) {
      const spot = starterSeedSpot(grid, def)
      await client.query(
        `INSERT INTO home_placements (id, character_id, item_id, x, z, rot, paid) VALUES ($1, $2, $3, $4, $5, 0, 0)`,
        [`hp_${createId()}`, characterId, def.item, spot.x, spot.z],
      )
    }
    await client.query(
      `INSERT INTO home_starters (character_id, lodging_id, items) VALUES ($1, $2, $3)
       ON CONFLICT (character_id) DO UPDATE SET lodging_id = EXCLUDED.lodging_id, items = EXCLUDED.items, seeded_at = NOW()`,
      [characterId, key, defs.map((d) => d.item)],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * A home seeded before some starters existed: add the ones never given (where they stand in the
 * room, or the first free spot if something is there now). Nothing already placed is touched.
 */
async function addNewStarters(
  client: PoolClient,
  characterId: string,
  grid: (typeof HOME_GRID)[string],
  defs: (typeof STARTERS)[string],
  given: string[] | null,
) {
  const placements = await loadPlacements(client, characterId)
  const missing = startersToAdd(defs, given, placements.map((p) => p.itemId))
  if (missing.length === 0) return
  const shapes = shapesOf(await loadCatalog(client))
  const added: string[] = []
  for (const def of missing) {
    if (!shapes.has(def.item)) continue // catalogue row not there yet
    const seed = starterSeedSpot(grid, def)
    const spot = checkHomePlacement(grid, shapes, placements, def.item, seed).ok
      ? seed
      : firstFreeHomeSpot(grid, shapes, placements, def.item)
    if (!spot) continue // no room: try again next time
    const id = `hp_${createId()}`
    await client.query(
      `INSERT INTO home_placements (id, character_id, item_id, x, z, rot, paid) VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [id, characterId, def.item, spot.x, spot.z, spot.rot],
    )
    placements.push({ id, itemId: def.item, x: spot.x, z: spot.z, rot: spot.rot, paid: 0 })
    added.push(def.item)
  }
  if (added.length === 0) return
  await client.query(`UPDATE home_starters SET items = $2 WHERE character_id = $1`, [
    characterId,
    [...new Set([...(given ?? FIRST_STARTERS), ...added])],
  ])
}

/** Apps from before starter furniture don't know how to draw it: leave it out for them. */
function withoutStarters<T extends { catalog: HomeItem[]; placements: { itemId: string }[] }>(data: T, starters: boolean): T {
  if (starters) return data
  const ids = new Set(data.catalog.filter((i) => i.starter).map((i) => i.id))
  return { ...data, catalog: data.catalog.filter((i) => !i.starter), placements: data.placements.filter((p) => !ids.has(p.itemId)) }
}

export async function getHomeBuy(userId: string, starters = false) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const spec = specFor(gate.character.lodging_id)
  if (spec && starters) await ensureStarters(gate.character.id, gate.character.lodging_id)
  const loaded = withoutStarters(
    { catalog: await loadCatalog(pool), placements: await loadPlacements(pool, gate.character.id) },
    starters,
  )
  const { catalog, placements } = loaded
  return {
    ok: true as const,
    enabled: spec !== null,
    lodgingId: normalizeLodgingId(gate.character.lodging_id),
    catalog,
    placements,
    decor: await loadDecor(pool, gate.character.id),
    decorZones: decorZones(gate.character.lodging_id),
  }
}

/** What's placed in someone's home (yours, or a visit when visits are on). */
export async function getHomePlacements(viewerId: string, username: string, starters = false) {
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
  const [catalog, placements, decor] = await Promise.all([loadCatalog(pool), loadPlacements(pool, row.character_id), loadDecor(pool, row.character_id)])
  return { ok: true as const, ...withoutStarters({ catalog, placements }, starters), decor }
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
    if (!item || item.starter || !item.available) return bad('That item is not sold.', 404, 'UNKNOWN_ITEM')
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
        message: refunded > 0 ? `Sold for ₦${refunded.toLocaleString('en-NG')}.` : 'Removed.',
      },
    }
  })
}

/**
 * After moving house: the new home's starter furniture goes in, then every piece you bought is
 * carried over. Each keeps its spot if it still fits, else takes the first free spot (any turn);
 * a piece that can't fit anywhere (or when the new home is a hostel bunk) is sold back at 50%.
 */
export async function rehomeFurniture(characterId: string, lodgingId: string) {
  await ensureStarters(characterId, lodgingId)
  const spec = specFor(lodgingId)
  const client = await pool.connect()
  let kept = 0
  let refunded = 0
  let refundTotal = 0
  try {
    await client.query('BEGIN')
    const catalog = await loadCatalog(client)
    const shapes = shapesOf(catalog)
    const all = await loadPlacements(client, characterId)
    const placed = all.filter((p) => p.itemId.startsWith('starter-'))
    const bought = all.filter((p) => !p.itemId.startsWith('starter-'))
    for (const piece of bought) {
      let spot: { x: number; z: number; rot: HomeRotation } | null = null
      if (spec) {
        const fits = (s: { x: number; z: number; rot: HomeRotation }) => checkHomePlacement(spec, shapes, placed, piece.itemId, s).ok
        const same = { x: piece.x, z: piece.z, rot: piece.rot }
        if (fits(same)) spot = same
        for (const rot of [0, 90, 180, 270] as HomeRotation[]) {
          if (spot) break
          for (let z = 0; z < spec.rows && !spot; z++) {
            for (let x = 0; x < spec.cols && !spot; x++) {
              if (fits({ x, z, rot })) spot = { x, z, rot }
            }
          }
        }
      }
      if (spot) {
        await client.query(`UPDATE home_placements SET x = $2, z = $3, rot = $4 WHERE id = $1`, [piece.id, spot.x, spot.z, spot.rot])
        placed.push({ ...piece, ...spot })
        kept++
      } else {
        const back = sellBackPrice(piece.paid ?? 0)
        const item = catalog.find((i) => i.id === piece.itemId)
        if (back > 0) await applyCash(client, characterId, back, `Sold ${item?.name ?? 'furniture'} (didn't fit your new home)`, 'refund')
        await client.query(`DELETE FROM home_placements WHERE id = $1`, [piece.id])
        refunded++
        refundTotal += back
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return { kept, refunded, refundTotal }
}

/** A home's design (wall paint, floor, kitchen & bathroom tiles). */
async function loadDecor(db: Pick<PoolClient, 'query'>, characterId: string) {
  const res = await db.query<{ home_decor: unknown }>(`SELECT home_decor FROM characters WHERE id = $1`, [characterId])
  return cleanDecor(res.rows[0]?.home_decor)
}

/** Buy a wall paint / floor / tiles for your home: checks the home has that zone, charges, saves. */
export function buyHomeDecor(userId: string, zone: DecorZone, value: string, idemKey: string) {
  return writeHome(userId, idemKey, 'POST /home/decor', { zone, value }, true, async ({ client, characterId }) => {
    const lodging = await client.query<{ lodging_id: string | null }>(`SELECT lodging_id FROM characters WHERE id = $1`, [characterId])
    if (!decorZones(lodging.rows[0]?.lodging_id).includes(zone)) {
      return bad(zone === 'tiles' ? 'Your home has no kitchen or bathroom tiles to change.' : 'You can’t change that in this home.', 400, 'NO_ZONE')
    }
    const price = decorPrice(zone, value)
    if (price === null) return bad('That design isn’t sold.', 404, 'UNKNOWN_DECOR')
    const decor = await loadDecor(client, characterId)
    if (decor[zone] === value.toLowerCase()) return bad('Your home already has that.', 400, 'SAME_DECOR')
    const name = decorName(zone, value)
    const what = zone === 'wall' ? 'wall paint' : zone === 'floor' ? 'floor' : 'kitchen & bathroom tiles'
    if (price > 0) {
      const wrote = await applyCash(client, characterId, -price, `${name} ${what} for your home`, 'purchase')
      if (!wrote.ok) return bad('Not enough naira for that.', 400, 'INSUFFICIENT_FUNDS')
    }
    const next = { ...decor, [zone]: value.toLowerCase() }
    await client.query(`UPDATE characters SET home_decor = $2::jsonb WHERE id = $1`, [characterId, JSON.stringify(next)])
    return {
      status: 200,
      body: { ok: true, decor: next, placements: await loadPlacements(client, characterId), message: `${name} ${what} done.` },
    }
  })
}

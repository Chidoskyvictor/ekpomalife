import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { asMoney, getPublicState } from './game-state.js'
import { requireEconomySetup } from './economy.js'
import { checkHomePlacement, type HomeRotation } from './home-buy-rules.js'
import { loadCatalog, loadDecor, loadPlacements, pickFinish, shapesOf, specFor } from './home-buy.js'
import { bad, characterOf, good, lockGig, logEvent, startGigTx, writeGig, type GigRow } from './gigs.js'
import { budgetLeft, keyOpen } from './gigs-rules.js'

/*
 * The decorator's 3D job. A hired decorator walks into the owner's house (the normal visit) and
 * uses the Buy-mode tools on the OWNER's furniture: move, turn, put into storage, and place items
 * bought from the job's item budget (held in escrow). Nothing can be sold or deleted. The layout
 * is snapshotted when work starts so the owner can undo it (gigs.ts undoLayout).
 */

type Spot = { x: number; z: number; rot: HomeRotation }

/** The job a decorator may work on right now, or why not. */
async function openJob(db: Pick<PoolClient, 'query'>, userId: string, gigId: string, lock: boolean): Promise<{ g: GigRow } | { error: string; status: number }> {
  const r = await db.query<GigRow>(`SELECT * FROM gigs WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [gigId])
  const g = r.rows[0]
  if (!g || g.worker_id !== userId) return { error: 'That is not your job.', status: 404 }
  if (g.category !== 'decorator') return { error: 'This is not a decorating job.', status: 400 }
  if (!keyOpen(g.status, g.start_at, g.expires_at, new Date())) return { error: 'Your job key is not open right now.', status: 403 }
  return { g }
}

/** The owner's house as the decorator sees it: same shape as Buy mode's own list, plus the budget left. */
export async function getGigHome(userId: string, gigId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const job = await openJob(pool, userId, gigId, false)
  if ('error' in job) return { ok: false as const, error: job.error, code: job.status }
  const { g } = job
  const ownerChar = await characterOf(pool, g.owner_id)
  if (!ownerChar) return { ok: false as const, error: 'That house is not ready.', code: 409 }
  const lodging = await pool.query<{ lodging_id: string | null; username: string }>(
    `SELECT c.lodging_id, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [ownerChar],
  )
  const spec = specFor(lodging.rows[0]?.lodging_id ?? null)
  const [catalog, placements, stored, decor] = await Promise.all([
    loadCatalog(pool),
    loadPlacements(pool, ownerChar),
    loadPlacements(pool, ownerChar, true),
    loadDecor(pool, ownerChar),
  ])
  return {
    ok: true as const,
    enabled: spec !== null,
    lodgingId: lodging.rows[0]?.lodging_id ?? '',
    ownerUsername: lodging.rows[0]?.username ?? '',
    catalog,
    placements,
    stored,
    decor,
    budgetLeft: budgetLeft(asMoney(g.budget), asMoney(g.budget_spent)),
  }
}

/** Runs one decorator write on the owner's house: idempotent, serialized with the owner's own edits. */
async function writeDecor(
  userId: string,
  gigId: string,
  key: string,
  route: string,
  body: unknown,
  run: (c: { client: PoolClient; g: GigRow; ownerChar: string; spec: NonNullable<ReturnType<typeof specFor>>; catalog: Awaited<ReturnType<typeof loadCatalog>> }) => Promise<ReturnType<typeof good>>,
) {
  const result = await writeGig(userId, key, route, { gigId, ...(body as object) }, async ({ client }) => {
    const job = await openJob(client, userId, gigId, true)
    if ('error' in job) return bad(job.error, job.status)
    let g = job.g
    const ownerChar = await characterOf(client, g.owner_id)
    if (!ownerChar) return bad('That house is not ready.', 409)
    const lodging = await client.query<{ lodging_id: string | null }>(`SELECT lodging_id FROM characters WHERE id = $1`, [ownerChar])
    const spec = specFor(lodging.rows[0]?.lodging_id ?? null)
    if (!spec) return bad('A hostel bunk cannot be decorated.', 400)
    // Same lock the owner's own Buy-mode writes take, so the two never edit at once
    await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [ownerChar])
    if (g.status === 'hired') g = await startGigTx(client, g)
    const catalog = await loadCatalog(client)
    return run({ client, g, ownerChar, spec, catalog })
  })
  if (!result.ok) return result
  const pub = await getPublicState(userId)
  if (!pub.ok) return pub
  return { ...result, state: { ok: true as const, ...pub.state } }
}

async function reply(client: PoolClient, ownerChar: string, gigId: string, message: string, extra: Record<string, unknown> = {}) {
  const g = await client.query<GigRow>(`SELECT budget, budget_spent FROM gigs WHERE id = $1`, [gigId])
  return good({
    placements: await loadPlacements(client, ownerChar),
    stored: await loadPlacements(client, ownerChar, true),
    budgetLeft: budgetLeft(asMoney(g.rows[0]!.budget), asMoney(g.rows[0]!.budget_spent)),
    message,
    ...extra,
  })
}

/** Move or turn one of the owner's pieces (or take one out of storage). */
export function gigMove(userId: string, gigId: string, id: string, spot: Spot, key: string) {
  return writeDecor(userId, gigId, key, 'POST /gigs/home/move', { id, ...spot }, async ({ client, ownerChar, spec, catalog }) => {
    const placed = await loadPlacements(client, ownerChar)
    const mine = placed.find((p) => p.id === id) ?? (await loadPlacements(client, ownerChar, true)).find((p) => p.id === id)
    if (!mine) return bad('That is not in this house.', 404)
    const check = checkHomePlacement(spec, shapesOf(catalog), placed.filter((p) => p.id !== id), mine.itemId, spot)
    if (!check.ok) return bad(check.error, 400, check.code)
    await client.query(`UPDATE home_placements SET x = $2, z = $3, rot = $4, stored = FALSE WHERE id = $1`, [id, spot.x, spot.z, spot.rot])
    return reply(client, ownerChar, gigId, 'Moved.')
  })
}

/** Put a piece into the owner's storage (never sells or deletes it). */
export function gigStore(userId: string, gigId: string, id: string, key: string) {
  return writeDecor(userId, gigId, key, 'POST /gigs/home/store', { id }, async ({ client, ownerChar }) => {
    const found = await client.query(`SELECT 1 FROM home_placements WHERE id = $1 AND character_id = $2`, [id, ownerChar])
    if (!found.rows[0]) return bad('That is not in this house.', 404)
    await client.query(`UPDATE home_placements SET stored = TRUE WHERE id = $1`, [id])
    return reply(client, ownerChar, gigId, 'Put in storage.')
  })
}

/** Buy an item from the job's item budget and place it in the owner's house (it becomes the owner's). */
export function gigPlace(userId: string, gigId: string, itemId: string, spot: Spot, finish: string | null | undefined, key: string) {
  return writeDecor(userId, gigId, key, 'POST /gigs/home/place', { itemId, ...spot, finish: finish ?? null }, async ({ client, g, ownerChar, spec, catalog }) => {
    const item = catalog.find((i) => i.id === itemId)
    if (!item || item.starter || !item.available) return bad('That item is not sold.', 404, 'UNKNOWN_ITEM')
    const chosen = pickFinish(item, finish)
    if (chosen === 'BAD') return bad('That colour is not sold for this item.', 400, 'UNKNOWN_FINISH')
    const left = budgetLeft(asMoney(g.budget), asMoney(g.budget_spent))
    if (item.price > left) return bad('Not enough item budget left for that.', 400, 'INSUFFICIENT_FUNDS')
    const placed = await loadPlacements(client, ownerChar)
    const check = checkHomePlacement(spec, shapesOf(catalog), placed, itemId, spot)
    if (!check.ok) return bad(check.error, 400, check.code)
    const id = `hp_${createId()}`
    await client.query(
      `INSERT INTO home_placements (id, character_id, item_id, x, z, rot, paid, finish) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ownerChar, itemId, spot.x, spot.z, spot.rot, item.price, chosen],
    )
    await client.query(`UPDATE gigs SET budget_spent = budget_spent + $2, escrow = escrow - $2 WHERE id = $1`, [gigId, item.price])
    await logEvent(client, gigId, 'budget_spent', item.price, userId)
    return reply(client, ownerChar, gigId, `${item.name} placed.`, { placedId: id })
  })
}

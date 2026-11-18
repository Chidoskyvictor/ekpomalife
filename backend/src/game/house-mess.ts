import { randomInt } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { bad, characterOf, good, lockGig, startGigTx, writeGig } from './gigs.js'
import { cleanlinessOf, keyOpen, MESS, messDue } from './gigs-rules.js'
import { checkHomePlacement, type HomeShape } from './home-buy-rules.js'
import { loadCatalog, loadPlacements, shapesOf, specFor } from './home-buy.js'

/*
 * Mess in houses for the Cleaner job. Props appear lazily (the first time anyone looks after the
 * wait is up), on free floor tiles, so a house gets messy even while its owner is away. A hired
 * Cleaner taps them away in 3D; cleanliness (100 minus 12 per open prop) goes back up.
 */

export type MessProp = { id: string; kind: string; x: number; z: number }

const MESS_SHAPE: HomeShape = { id: 'mess', w: 1, d: 1, wall: false, maxPerHome: 999 }

async function openMess(db: Pick<PoolClient, 'query'>, ownerId: string): Promise<MessProp[]> {
  const r = await db.query<MessProp>(`SELECT id, kind, x, z FROM house_mess WHERE owner_id = $1 AND cleared_at IS NULL ORDER BY created_at`, [ownerId])
  return r.rows
}

/** Add whatever props are due to this house (serialized per house), then return what is open. */
async function spawnDue(client: PoolClient, ownerId: string): Promise<MessProp[]> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mess:${ownerId}`])
  const state = await client.query<{ hours: number }>(`SELECT EXTRACT(EPOCH FROM (NOW() - last_spawn_at)) / 3600 AS hours FROM house_mess_state WHERE owner_id = $1`, [ownerId])
  const open = await openMess(client, ownerId)
  const first = state.rows.length === 0
  const hours = first ? MESS.starter * MESS.everyHours : Number(state.rows[0]!.hours)
  const due = messDue(hours, open.length)
  if (due === 0 && !first) return open
  const ownerChar = await characterOf(client, ownerId)
  const lodging = ownerChar ? await client.query<{ lodging_id: string | null }>(`SELECT lodging_id FROM characters WHERE id = $1`, [ownerChar]) : null
  const spec = specFor(lodging?.rows[0]?.lodging_id ?? null)
  await client.query(
    `INSERT INTO house_mess_state (owner_id, last_spawn_at) VALUES ($1, NOW()) ON CONFLICT (owner_id) DO UPDATE SET last_spawn_at = NOW()`,
    [ownerId],
  )
  if (!spec || !ownerChar || due === 0) return open
  const shapes = shapesOf(await loadCatalog(client))
  shapes.set(MESS_SHAPE.id, MESS_SHAPE)
  const placed = await loadPlacements(client, ownerChar)
  const taken = new Set(open.map((m) => `${m.x},${m.z}`))
  let added = 0
  for (let tries = 0; tries < 60 && added < due; tries++) {
    const x = randomInt(0, spec.cols)
    const z = randomInt(0, spec.rows)
    if (taken.has(`${x},${z}`)) continue
    if (!checkHomePlacement(spec, shapes, placed, MESS_SHAPE.id, { x, z, rot: 0 }).ok) continue
    const id = `mess_${createId()}`
    const kind = MESS.kinds[randomInt(0, MESS.kinds.length)]!
    await client.query(`INSERT INTO house_mess (id, owner_id, kind, x, z) VALUES ($1, $2, $3, $4, $5)`, [id, ownerId, kind, x, z])
    open.push({ id, kind, x, z })
    taken.add(`${x},${z}`)
    added++
  }
  return open
}

/** The open mess in a house and how clean it is. Anyone signed in can look (they can walk in anyway). */
export async function getHouseMess(username: string) {
  const owner = await pool.query<{ id: string }>(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [username])
  const ownerId = owner.rows[0]?.id
  if (!ownerId) return { ok: false as const, error: 'No such home.', code: 404 }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const mess = await spawnDue(client, ownerId)
    await client.query('COMMIT')
    return { ok: true as const, mess, cleanliness: cleanlinessOf(mess.length) }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Cleaner taps one prop away. Idempotent; the first tap starts the job. */
export function cleanMess(userId: string, gigId: string, messId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/clean', { gigId, messId }, async ({ client }) => {
    let g = await lockGig(client, gigId)
    if (!g || g.worker_id !== userId) return bad('That is not your job.', 404)
    if (g.category !== 'cleaner') return bad('This is not a cleaning job.', 400)
    if (!keyOpen(g.status, g.start_at, g.expires_at, new Date())) return bad('Your job key is not open right now.', 403)
    if (g.status === 'hired') g = await startGigTx(client, g)
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mess:${g.owner_id}`])
    const hit = await client.query(
      `UPDATE house_mess SET cleared_at = NOW(), cleared_by = $3, gig_id = $4 WHERE id = $1 AND owner_id = $2 AND cleared_at IS NULL RETURNING id`,
      [messId, g.owner_id, userId, gigId],
    )
    // Already gone (someone else, or a repeat tap): just show how it is now
    const mess = await openMess(client, g.owner_id)
    const cleaned = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM house_mess WHERE gig_id = $1`, [gigId])
    return good({ mess, cleanliness: cleanlinessOf(mess.length), cleaned: cleaned.rows[0]?.n ?? 0, message: hit.rows[0] ? 'Cleaned.' : 'Already cleaned.' })
  })
}

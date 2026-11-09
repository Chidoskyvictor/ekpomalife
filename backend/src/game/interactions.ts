import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { postNudge } from './chat.js'
import { announceHome, homeHas, homePosition, tellHomeUser } from './club-live.js'
import { applyNeedDelta, type Needs } from './needs.js'
import { parseNeeds } from './game-state.js'
import { PAIR_SECONDS, pairSpots } from './bae-rules.js'
import { areBaes, endAllBetween, recordInteraction } from './bae.js'

/*
 * Player-to-player interactions inside a home (you visit them, or they visit you).
 * - Friendly actions are always open; hug needs "close friend"; romantic ones need BOTH players to
 *   have opted in as partners AND the other player to accept each time (never forced).
 * - Everything (cooldowns, success rolls, needs, relationship points) is decided here, then the
 *   result is pushed live to the home's room so both characters play it.
 * - Blocked either way = no interaction.
 */

export type Tier = 'friendly' | 'close' | 'romantic'

export type InteractionDef = {
  id: string
  tier: Tier
  /** The other player must accept first. */
  ask: boolean
  /** Chance it works (the rest "flops": small social hit, no points). */
  chance: number
  needs: Partial<Needs>
  /** The other player gets a share too (two-person activities). */
  shared: boolean
  points: number
  cooldownSec: number
  /** Only a visitor can do this to the host. */
  visitorOnly?: boolean
}

export const INTERACTIONS: Record<string, InteractionDef> = {
  'love-house': { id: 'love-house', tier: 'friendly', ask: false, chance: 1, needs: { social: 4 }, shared: false, points: 1, cooldownSec: 600, visitorOnly: true },
  hello: { id: 'hello', tier: 'friendly', ask: false, chance: 1, needs: { social: 4 }, shared: false, points: 1, cooldownSec: 60 },
  gist: { id: 'gist', tier: 'friendly', ask: false, chance: 1, needs: { fun: 4, social: 5 }, shared: true, points: 2, cooldownSec: 60 },
  joke: { id: 'joke', tier: 'friendly', ask: false, chance: 0.7, needs: { fun: 7, social: 4 }, shared: false, points: 1, cooldownSec: 60 },
  compliment: { id: 'compliment', tier: 'friendly', ask: false, chance: 1, needs: { fun: 3, social: 6 }, shared: false, points: 1, cooldownSec: 60 },
  shade: { id: 'shade', tier: 'friendly', ask: false, chance: 0.6, needs: { fun: 6, social: 3 }, shared: false, points: 1, cooldownSec: 90 },
  handshake: { id: 'handshake', tier: 'friendly', ask: false, chance: 1, needs: { social: 5 }, shared: true, points: 2, cooldownSec: 90 },
  sneakers: { id: 'sneakers', tier: 'friendly', ask: false, chance: 1, needs: { fun: 4, social: 4 }, shared: true, points: 1, cooldownSec: 90 },
  fifa: { id: 'fifa', tier: 'friendly', ask: false, chance: 1, needs: { fun: 10, social: 5 }, shared: true, points: 2, cooldownSec: 180 },
  'arm-wrestle': { id: 'arm-wrestle', tier: 'friendly', ask: false, chance: 0.5, needs: { fun: 8, social: 4, energy: -4 }, shared: false, points: 2, cooldownSec: 180 },
  'japa-plans': { id: 'japa-plans', tier: 'friendly', ask: false, chance: 1, needs: { fun: 5, social: 6 }, shared: true, points: 2, cooldownSec: 120 },
  together: { id: 'together', tier: 'friendly', ask: false, chance: 1, needs: { fun: 6, social: 10 }, shared: true, points: 5, cooldownSec: 6 * 3600 },
  'kiss-cheek': { id: 'kiss-cheek', tier: 'close', ask: true, chance: 1, needs: { social: 8, fun: 4 }, shared: true, points: 3, cooldownSec: 300 },
  hug: { id: 'hug', tier: 'close', ask: true, chance: 1, needs: { social: 8, fun: 3 }, shared: true, points: 3, cooldownSec: 300 },
  'hold-hands': { id: 'hold-hands', tier: 'romantic', ask: true, chance: 1, needs: { social: 8, fun: 4 }, shared: true, points: 3, cooldownSec: 300 },
  cuddle: { id: 'cuddle', tier: 'romantic', ask: true, chance: 1, needs: { social: 10, fun: 5, energy: 3 }, shared: true, points: 4, cooldownSec: 600 },
  'slow-dance': { id: 'slow-dance', tier: 'romantic', ask: true, chance: 1, needs: { social: 10, fun: 8 }, shared: true, points: 4, cooldownSec: 600 },
  kiss: { id: 'kiss', tier: 'romantic', ask: true, chance: 1, needs: { social: 12, fun: 6 }, shared: true, points: 5, cooldownSec: 900 },
}

/** Points needed for each friendship level. */
export const PADI_POINTS = 8
export const CLOSE_POINTS = 30

export type Level = 'stranger' | 'padi' | 'close' | 'crush' | 'partner'

/** Mutual opt-in = partner; only you opted in = crush; otherwise by points. (Their one-sided opt-in is never revealed.) */
export function levelFor(points: number, youOptIn: boolean, mutual: boolean): Level {
  if (mutual) return 'partner'
  if (youOptIn) return 'crush'
  return points >= CLOSE_POINTS ? 'close' : points >= PADI_POINTS ? 'padi' : 'stranger'
}

/** Why you can't do this right now, or null. Pure, so it's unit-tested. */
export function gate(def: InteractionDef, rel: { points: number; mutualPartners: boolean }): string | null {
  if (def.tier === 'close' && rel.points < CLOSE_POINTS && !rel.mutualPartners) return 'Hugs unlock when you are close friends.'
  if (def.tier === 'romantic' && !rel.mutualPartners) return 'You both need to be partners first.'
  return null
}

export const pairOf = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])

type Fail = { ok: false; error: string; code: number }
const fail = (code: number, error: string): Fail => ({ ok: false, error, code })

async function userByName(username: string) {
  const r = await pool.query<{ id: string; username: string }>(`SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)`, [username])
  return r.rows[0] ?? null
}

export async function isBlocked(a: string, b: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM player_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [a, b],
  )
  return r.rows.length > 0
}

export async function relationBetween(me: string, other: string) {
  const [a, b] = pairOf(me, other)
  const [rel, opt, blk] = await Promise.all([
    pool.query<{ points: number }>(`SELECT points FROM player_relations WHERE a_id = $1 AND b_id = $2`, [a, b]),
    pool.query<{ user_id: string }>(
      `SELECT user_id FROM partner_optins WHERE (user_id = $1 AND with_id = $2) OR (user_id = $2 AND with_id = $1)`,
      [me, other],
    ),
    pool.query<{ blocker_id: string }>(
      `SELECT blocker_id FROM player_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [me, other],
    ),
  ])
  const points = rel.rows[0]?.points ?? 0
  const bae = await areBaes(me, other)
  const you = opt.rows.some((r) => r.user_id === me)
  const them = opt.rows.some((r) => r.user_id === other)
  return {
    points,
    level: levelFor(points, you, (you && them) || bae),
    partnerYou: you,
    partnerThem: them,
    mutualPartners: (you && them) || bae,
    bae,
    blockedByYou: blk.rows.some((r) => r.blocker_id === me),
    blockedYou: blk.rows.some((r) => r.blocker_id === other),
  }
}

export async function getRelation(userId: string, username: string) {
  const other = await userByName(username)
  if (!other || other.id === userId) return fail(404, 'No such player.')
  const rel = await relationBetween(userId, other.id)
  // We never tell you that THEY opted in until you did too (no pressure, no surprises)
  return {
    ok: true as const,
    relation: { ...rel, partnerThem: rel.mutualPartners, blockedYou: false, withUsername: other.username },
  }
}

export async function setPartner(userId: string, username: string, on: boolean) {
  const other = await userByName(username)
  if (!other || other.id === userId) return fail(404, 'No such player.')
  if (await isBlocked(userId, other.id)) return fail(403, 'You cannot do that.')
  if (on) {
    await pool.query(`INSERT INTO partner_optins (user_id, with_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, other.id])
  } else {
    await pool.query(`DELETE FROM partner_optins WHERE user_id = $1 AND with_id = $2`, [userId, other.id])
  }
  return getRelation(userId, username)
}

export async function setBlock(userId: string, username: string, on: boolean) {
  const other = await userByName(username)
  if (!other || other.id === userId) return fail(404, 'No such player.')
  if (on) {
    await pool.query(`INSERT INTO player_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, other.id])
    // Blocking ends any partner opt-in either way
    await pool.query(`DELETE FROM partner_optins WHERE (user_id = $1 AND with_id = $2) OR (user_id = $2 AND with_id = $1)`, [userId, other.id])
    await endAllBetween(userId, other.id)
  } else {
    await pool.query(`DELETE FROM player_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [userId, other.id])
  }
  return getRelation(userId, username)
}

export async function reportPlayer(userId: string, username: string, reason: string) {
  const other = await userByName(username)
  if (!other || other.id === userId) return fail(404, 'No such player.')
  const clean = reason.trim().slice(0, 200) || 'other'
  await pool.query(`INSERT INTO player_reports (id, reporter_id, target_id, reason) VALUES ($1, $2, $3, $4)`, [createId(), userId, other.id, clean])
  return { ok: true as const }
}

/** Needs for a player by user id (inside the caller's transaction). */
async function giveNeeds(client: PoolClient, userId: string, delta: Partial<Needs>) {
  const row = await client.query<{ character_id: string; needs: Needs | string }>(
    `SELECT g.character_id, g.needs FROM game_state g JOIN characters c ON c.id = g.character_id WHERE c.user_id = $1 FOR UPDATE OF g`,
    [userId],
  )
  const r = row.rows[0]
  if (!r) return
  const next = applyNeedDelta(parseNeeds(r.needs), delta)
  await client.query(`UPDATE game_state SET needs = $2::jsonb, updated_at = NOW() WHERE character_id = $1`, [r.character_id, JSON.stringify(next)])
}

type Pending = { id: string; from: string; to: string; fromName: string; toName: string; actionId: string; homeOwnerId: string; expires: number }
const pending = new Map<string, Pending>()
const ASK_SECONDS = 30

/** Apply one interaction after every check has passed. */
async function play(def: InteractionDef, from: string, to: string, fromName: string, toName: string, homeOwnerId: string) {
  const landed = Math.random() < def.chance
  const client = await pool.connect()
  let points = 0
  try {
    await client.query('BEGIN')
    // Fixed order so two players acting at once can't deadlock
    const [first, second] = pairOf(from, to)
    const own = landed ? def.needs : { social: -2 }
    const other: Partial<Needs> = landed && def.shared ? def.needs : {}
    for (const id of [first, second]) {
      if (id === from) await giveNeeds(client, id, own)
      else if (Object.keys(other).length) await giveNeeds(client, id, other)
    }
    await client.query(
      `INSERT INTO player_interaction_log (actor_id, target_id, action_id, last_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (actor_id, target_id, action_id) DO UPDATE SET last_at = NOW()`,
      [from, to, def.id],
    )
    if (landed) {
      const [a, b] = pairOf(from, to)
      const r = await client.query<{ points: number }>(
        `INSERT INTO player_relations (a_id, b_id, points) VALUES ($1, $2, $3)
         ON CONFLICT (a_id, b_id) DO UPDATE SET points = player_relations.points + EXCLUDED.points, updated_at = NOW()
         RETURNING points`,
        [a, b, def.points],
      )
      points = r.rows[0]?.points ?? def.points
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  announceHome(homeOwnerId, { t: 'act', action: def.id, from, to, fromUsername: fromName, toUsername: toName, landed })
  if (['hello', 'gist', 'joke', 'compliment'].includes(def.id)) void postNudge(from, to, def.id).catch(() => {})
  if (landed) void recordInteraction(from, to, def.id).catch(() => {})
  // Affectionate actions play as one synced pair: both characters walk together and hold the pose
  const hold = PAIR_SECONDS[def.id]
  if (landed && hold) {
    const pa = homePosition(homeOwnerId, from)
    const pb = homePosition(homeOwnerId, to)
    const spots = pa && pb ? pairSpots(def.id, pa, pb) : null
    announceHome(homeOwnerId, {
      t: 'pair',
      action: def.id,
      seconds: hold,
      spots: spots ? { [fromName]: spots.a, [toName]: spots.b } : null,
    })
  }
  return { landed, points }
}

async function cooldownLeft(from: string, to: string, def: InteractionDef): Promise<number> {
  const r = await pool.query<{ left: number }>(
    `SELECT GREATEST(0, CEIL($4 - EXTRACT(EPOCH FROM (NOW() - last_at))))::int AS left
     FROM player_interaction_log WHERE actor_id = $1 AND target_id = $2 AND action_id = $3`,
    [from, to, def.id, def.cooldownSec],
  )
  return r.rows[0]?.left ?? 0
}

/** Everything that must be true before an interaction (or a request for one) starts. */
async function check(userId: string, targetName: string, homeOwnerName: string, actionId: string) {
  const def = INTERACTIONS[actionId]
  if (!def) return fail(400, 'Unknown action.')
  const [target, owner] = await Promise.all([userByName(targetName), userByName(homeOwnerName)])
  if (!target || !owner || target.id === userId) return fail(404, 'No such player.')
  if (await isBlocked(userId, target.id)) return fail(403, 'You cannot interact with this player.')
  // Both must be inside that home right now (no remote farming)
  if (!homeHas(owner.id, userId) || !homeHas(owner.id, target.id)) return fail(409, 'You both need to be in the same home.')
  if (def.visitorOnly && owner.id === userId) return fail(400, 'Only visitors can do that.')
  const rel = await relationBetween(userId, target.id)
  const why = gate(def, rel)
  if (why) return fail(403, why)
  const left = await cooldownLeft(userId, target.id, def)
  if (left > 0) return fail(429, `Give them a moment (${left}s).`)
  return { ok: true as const, def, target, owner }
}

export async function doInteraction(userId: string, myName: string, targetName: string, homeOwnerName: string, actionId: string) {
  const c = await check(userId, targetName, homeOwnerName, actionId)
  if (!c.ok) return c
  const { def, target, owner } = c
  if (def.ask) {
    // Never forced: they get a prompt, nothing plays until they accept
    for (const [k, p] of pending) if (p.expires < Date.now()) pending.delete(k)
    for (const p of pending.values()) if (p.from === userId && p.to === target.id) return fail(429, 'You already asked. Wait for their answer.')
    const id = randomUUID()
    pending.set(id, { id, from: userId, to: target.id, fromName: myName, toName: target.username, actionId, homeOwnerId: owner.id, expires: Date.now() + ASK_SECONDS * 1000 })
    tellHomeUser(owner.id, target.id, { t: 'ask', id, action: def.id, from: userId, fromUsername: myName, expiresIn: ASK_SECONDS })
    return { ok: true as const, pending: true as const, id }
  }
  const done = await play(def, userId, target.id, myName, target.username, owner.id)
  return { ok: true as const, pending: false as const, ...done }
}

export async function respondInteraction(userId: string, id: string, accept: boolean) {
  const p = pending.get(id)
  if (!p || p.expires < Date.now()) {
    pending.delete(id)
    return fail(410, 'That request expired.')
  }
  // Only the person being asked can answer
  if (p.to !== userId) return fail(403, 'That request is not for you.')
  pending.delete(id)
  if (!accept) {
    tellHomeUser(p.homeOwnerId, p.from, { t: 'declined', action: p.actionId, by: userId })
    return { ok: true as const, accepted: false as const }
  }
  const def = INTERACTIONS[p.actionId]!
  // Re-check at answer time: a block or opt-out in between cancels it
  if (await isBlocked(p.from, p.to)) return fail(403, 'You cannot interact with this player.')
  const rel = await relationBetween(p.from, p.to)
  const why = gate(def, rel)
  if (why) return fail(403, why)
  if (!homeHas(p.homeOwnerId, p.from) || !homeHas(p.homeOwnerId, p.to)) return fail(409, 'You both need to be in the same home.')
  const done = await play(def, p.from, p.to, p.fromName, p.toName, p.homeOwnerId)
  return { ok: true as const, accepted: true as const, ...done }
}

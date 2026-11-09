import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { openDirectChat, postNudge } from './chat.js'
import { homeHas } from './club-live.js'
import {
  anniversaryDue,
  BAE_CLOSENESS_NEEDED,
  CAUGHT_CHANCE,
  closenessGate,
  cooldownLeftHours,
  coupleLevel,
  coupleXp,
  DATE_COOLDOWN_SEC,
  DATE_SPOTS,
  GOALS,
  goalKind,
  INVERSE,
  MAX_BAES,
  RELATIONS,
  REQUEST_DAYS,
  statusLabel,
  type PairStats,
  type Relation,
} from './bae-rules.js'
import { applyCash, parseNeeds } from './game-state.js'
import { applyNeedDelta, type Needs } from './needs.js'

type Fail = { ok: false; error: string; code: number }
const fail = (code: number, error: string): Fail => ({ ok: false, error, code })
const pairOf = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])

type Person = { id: string; username: string }
async function userByName(username: string): Promise<Person | null> {
  const r = await pool.query<Person>(`SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)`, [username])
  return r.rows[0] ?? null
}
async function blocked(a: string, b: string) {
  const r = await pool.query(`SELECT 1 FROM player_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [a, b])
  return r.rows.length > 0
}

/* —— Closeness —— */

export async function closenessOf(a: string, b: string): Promise<number> {
  const [x, y] = pairOf(a, b)
  const r = await pool.query<{ points: number }>(`SELECT points FROM player_relations WHERE a_id = $1 AND b_id = $2`, [x, y])
  return r.rows[0]?.points ?? 0
}

/** Add closeness points, at most once per `everySec` per kind (so chatting back and forth can't be farmed). */
export async function addCloseness(a: string, b: string, points: number, kind: string, everySec: number) {
  if (a === b) return
  const [x, y] = pairOf(a, b)
  const claimed = await pool.query(
    `INSERT INTO closeness_log (a_id, b_id, kind, last_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (a_id, b_id, kind) DO UPDATE SET last_at = NOW()
       WHERE closeness_log.last_at < NOW() - make_interval(secs => $4)
     RETURNING 1`,
    [x, y, kind, everySec],
  )
  if (!claimed.rows.length) return
  await pool.query(
    `INSERT INTO player_relations (a_id, b_id, points) VALUES ($1, $2, $3)
     ON CONFLICT (a_id, b_id) DO UPDATE SET points = player_relations.points + EXCLUDED.points, updated_at = NOW()`,
    [x, y, points],
  )
}

/** Both players have written in the last half hour → +1 (every 5 minutes at most). */
export async function chatCloseness(senderId: string, chatId: string) {
  const peer = await pool.query<{ user_id: string; mutual: boolean }>(
    `SELECT cm.user_id,
            EXISTS (SELECT 1 FROM chat_messages m WHERE m.chat_id = cm.chat_id AND m.sender_id = cm.user_id AND m.kind = 'text'
                    AND m.created_at > NOW() - INTERVAL '30 minutes') AS mutual
     FROM chat_members cm JOIN chats c ON c.id = cm.chat_id AND c.kind = 'direct'
     WHERE cm.chat_id = $1 AND cm.user_id <> $2`,
    [chatId, senderId],
  )
  const p = peer.rows[0]
  if (p?.mutual) await addCloseness(senderId, p.user_id, 1, 'chat', 300)
}

/* —— Baes —— */

export async function baeCount(userId: string): Promise<number> {
  const r = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bae_pairs WHERE a_id = $1 OR b_id = $1`, [userId])
  return r.rows[0]?.n ?? 0
}

type PairRow = { a_id: string; b_id: string; since: Date; sneaky_by_a: boolean; sneaky_by_b: boolean } & PairStats

async function pairBetween(x: string, y: string): Promise<PairRow | null> {
  const [a, b] = pairOf(x, y)
  const r = await pool.query<PairRow>(`SELECT * FROM bae_pairs WHERE a_id = $1 AND b_id = $2`, [a, b])
  return r.rows[0] ?? null
}
export const areBaes = async (x: string, y: string) => !!(await pairBetween(x, y))

async function addEvent(userId: string, kind: string, body: string) {
  await pool.query(`INSERT INTO family_events (id, user_id, kind, body) VALUES ($1, $2, $3, $4)`, [createId(), userId, kind, body])
}

async function hiddenStatus(userId: string): Promise<boolean> {
  const r = await pool.query<{ hide_status: boolean }>(`SELECT hide_status FROM family_settings WHERE user_id = $1`, [userId])
  return r.rows[0]?.hide_status ?? false
}

/** Baes that aren't a secret: only these count for "In a relationship". */
async function openBaeCount(userId: string): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM bae_pairs
     WHERE (a_id = $1 AND NOT sneaky_by_a) OR (b_id = $1 AND NOT sneaky_by_b)`,
    [userId],
  )
  return r.rows[0]?.n ?? 0
}

export async function setHideStatus(userId: string, hide: boolean) {
  await pool.query(
    `INSERT INTO family_settings (user_id, hide_status) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET hide_status = EXCLUDED.hide_status`,
    [userId, hide],
  )
  return { ok: true as const, hideStatus: hide }
}

/* —— Requests —— */

type ReqRow = {
  id: string
  kind: 'bae' | 'relative'
  relation: string | null
  from_id: string
  to_id: string
  status: string
  created_at: Date
  expires_at: Date
  from_name: string
  to_name: string
}
const REQ_SELECT = `SELECT r.id, r.kind, r.relation, r.from_id, r.to_id, r.status, r.created_at, r.expires_at, f.username AS from_name, t.username AS to_name
  FROM family_requests r JOIN users f ON f.id = r.from_id JOIN users t ON t.id = r.to_id`

async function expireOld() {
  await pool.query(`UPDATE family_requests SET status = 'expired', answered_at = NOW() WHERE status = 'pending' AND expires_at <= NOW()`)
}

function publicRequest(r: ReqRow, viewerId: string) {
  return {
    id: r.id,
    kind: r.kind,
    relation: r.relation,
    status: r.status,
    mine: r.from_id === viewerId,
    from: r.from_name,
    to: r.to_name,
    expiresAt: new Date(r.expires_at).toISOString(),
  }
}

export async function getRequest(userId: string, id: string) {
  await expireOld()
  const r = await pool.query<ReqRow>(`${REQ_SELECT} WHERE r.id = $1`, [id])
  const row = r.rows[0]
  if (!row || (row.from_id !== userId && row.to_id !== userId)) return fail(404, 'No such request.')
  return { ok: true as const, request: publicRequest(row, userId) }
}

export async function sendRequest(userId: string, username: string, kind: 'bae' | 'relative', relation?: string) {
  const other = await userByName(username)
  if (!other || other.id === userId) return fail(404, 'No such player.')
  if (await blocked(userId, other.id)) return fail(403, 'You cannot send that to this player.')
  if (kind === 'relative' && !(RELATIONS as readonly string[]).includes(relation ?? '')) return fail(400, 'Pick how they are related to you.')
  await expireOld()
  const [a, b] = pairOf(userId, other.id)
  if (kind === 'bae') {
    if (await pairBetween(userId, other.id)) return fail(409, 'You are already baes.')
    const gate = closenessGate(await closenessOf(userId, other.id))
    if (!gate.unlocked) return fail(403, `Not close enough yet (${gate.progress}). Chat, gist and hang out more.`)
    if ((await baeCount(userId)) >= MAX_BAES) return fail(409, `You already have ${MAX_BAES} baes.`)
    if ((await baeCount(other.id)) >= MAX_BAES) return fail(409, 'They cannot take on another bae right now.')
  } else {
    const rel = await pool.query(`SELECT 1 FROM relatives WHERE a_id = $1 AND b_id = $2`, [a, b])
    if (rel.rows.length) return fail(409, 'You are already family.')
  }
  const pend = await pool.query<{ from_id: string }>(
    `SELECT from_id FROM family_requests WHERE kind = $3 AND status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
    [userId, other.id, kind],
  )
  if (pend.rows.length) return fail(409, pend.rows[0]!.from_id === userId ? 'You already asked. Wait for their answer.' : 'They already asked you. Check your requests.')
  const declined = await pool.query<{ answered_at: Date }>(
    `SELECT answered_at FROM family_requests WHERE from_id = $1 AND to_id = $2 AND kind = $3 AND status = 'declined' ORDER BY answered_at DESC LIMIT 1`,
    [userId, other.id, kind],
  )
  const wait = cooldownLeftHours(declined.rows[0]?.answered_at ? new Date(declined.rows[0].answered_at) : null)
  if (wait > 0) return fail(429, `Give them time. You can ask again in about ${wait}h.`)

  const id = createId()
  await pool.query(
    `INSERT INTO family_requests (id, kind, relation, from_id, to_id, expires_at) VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(days => $6))`,
    [id, kind, kind === 'relative' ? relation : null, userId, other.id, REQUEST_DAYS],
  )
  // The centred card in their direct chat (and in the Family app + phone notifications)
  const chat = await openDirectChat(userId, other.id)
  if (chat.ok) await pool.query(`INSERT INTO chat_messages (chat_id, sender_id, kind, body) VALUES ($1, $2, 'bae', $3)`, [chat.chat.id, userId, id])
  return getRequest(userId, id)
}

export async function respondRequest(userId: string, id: string, accept: boolean) {
  await expireOld()
  const r = await pool.query<ReqRow>(`${REQ_SELECT} WHERE r.id = $1`, [id])
  const row = r.rows[0]
  if (!row || row.to_id !== userId) return fail(404, 'No such request.')
  if (row.status !== 'pending') return fail(410, row.status === 'expired' ? 'That request expired.' : 'That request is already answered.')
  if (!accept) {
    await pool.query(`UPDATE family_requests SET status = 'declined', answered_at = NOW() WHERE id = $1`, [id])
    return getRequest(userId, id)
  }
  if (await blocked(row.from_id, row.to_id)) return fail(403, 'You cannot do that.')
  const [a, b] = pairOf(row.from_id, row.to_id)
  if (row.kind === 'bae') {
    if ((await baeCount(row.from_id)) >= MAX_BAES || (await baeCount(row.to_id)) >= MAX_BAES) return fail(409, `Max ${MAX_BAES} baes each.`)
    await pool.query(`INSERT INTO bae_pairs (a_id, b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [a, b])
    await addEvent(row.from_id, 'bae-yes', `@${row.to_name} accepted. You are now baes 💕`)
  } else {
    // relation = what the receiver is to the sender; stored as "what b is to a"
    const roleOfB = row.from_id === a ? (row.relation as string) : INVERSE[row.relation as Relation]
    await pool.query(`INSERT INTO relatives (a_id, b_id, role_of_b) VALUES ($1, $2, $3) ON CONFLICT (a_id, b_id) DO UPDATE SET role_of_b = EXCLUDED.role_of_b`, [a, b, roleOfB])
    await addEvent(row.from_id, 'family-yes', `@${row.to_name} accepted as your ${String(row.relation).replace('_', '/')} 👪`)
  }
  await pool.query(`UPDATE family_requests SET status = 'accepted', answered_at = NOW() WHERE id = $1`, [id])
  return getRequest(userId, id)
}

export async function cancelRequest(userId: string, id: string) {
  const r = await pool.query(`UPDATE family_requests SET status = 'cancelled', answered_at = NOW() WHERE id = $1 AND from_id = $2 AND status = 'pending' RETURNING 1`, [id, userId])
  if (!r.rows.length) return fail(404, 'Nothing to cancel.')
  return getRequest(userId, id)
}

/* —— Family view —— */

async function lastSeen(ids: string[]): Promise<Map<string, Date>> {
  const r = await pool.query<{ user_id: string; seen: Date }>(`SELECT user_id, MAX(last_seen_at) AS seen FROM sessions WHERE user_id = ANY($1) GROUP BY user_id`, [ids])
  return new Map(r.rows.filter((x) => x.seen).map((x) => [x.user_id, new Date(x.seen)]))
}

const ROLE_LABEL: Record<string, string> = { sibling: 'Sibling', cousin: 'Cousin', parent: 'Parent', child: 'Child', uncle_aunt: 'Uncle / Aunt', niece_nephew: 'Niece / Nephew' }

const roleFor = (viewerId: string, aId: string, roleOfB: string) => (aId === viewerId ? roleOfB : (INVERSE[roleOfB as Relation] ?? roleOfB))

export async function listFamily(userId: string) {
  await expireOld()
  const [pairs, rels, reqs, ev, hidden] = await Promise.all([
    pool.query<PairRow & { other: string; name: string; appearance: unknown }>(
      `SELECT p.*, CASE WHEN p.a_id = $1 THEN p.b_id ELSE p.a_id END AS other, u.username AS name,
              (SELECT c.appearance FROM characters c WHERE c.user_id = u.id LIMIT 1) AS appearance
       FROM bae_pairs p JOIN users u ON u.id = CASE WHEN p.a_id = $1 THEN p.b_id ELSE p.a_id END
       WHERE p.a_id = $1 OR p.b_id = $1 ORDER BY p.since`,
      [userId],
    ),
    pool.query<{ other: string; name: string; role_of_b: string; a_id: string; appearance: unknown }>(
      `SELECT r.a_id, r.role_of_b, CASE WHEN r.a_id = $1 THEN r.b_id ELSE r.a_id END AS other, u.username AS name,
              (SELECT c.appearance FROM characters c WHERE c.user_id = u.id LIMIT 1) AS appearance
       FROM relatives r JOIN users u ON u.id = CASE WHEN r.a_id = $1 THEN r.b_id ELSE r.a_id END
       WHERE r.a_id = $1 OR r.b_id = $1 ORDER BY r.since`,
      [userId],
    ),
    pool.query<ReqRow>(`${REQ_SELECT} WHERE r.status = 'pending' AND (r.from_id = $1 OR r.to_id = $1) ORDER BY r.created_at DESC`, [userId]),
    pool.query<{ id: string; kind: string; body: string; created_at: Date }>(
      `SELECT id, kind, body, created_at FROM family_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 10`,
      [userId],
    ),
    hiddenStatus(userId),
  ])
  const ids = [...pairs.rows.map((p) => p.other), ...rels.rows.map((r) => r.other)]
  const seen = ids.length ? await lastSeen(ids) : new Map<string, Date>()
  const now = Date.now()
  const status = (id: string) => {
    const s = seen.get(id)
    const online = !!s && now - s.getTime() < 3 * 60_000
    return { online, atHome: online && homeHas(id, id) }
  }
  const closeness = await Promise.all(pairs.rows.map((p) => closenessOf(userId, p.other)))
  const baes = pairs.rows.map((p, i) => {
    const mine = p.a_id === userId
    const stats: PairStats = { dates: p.dates, hangouts: p.hangouts, cozy: p.cozy, anniversaries: p.anniversaries }
    return {
      userId: p.other,
      username: p.name,
      appearance: p.appearance,
      sneaky: mine ? p.sneaky_by_a : p.sneaky_by_b,
      since: new Date(p.since).toISOString(),
      closeness: closeness[i],
      level: coupleLevel(stats),
      xp: coupleXp(stats),
      goals: GOALS.map((g) => ({ ...g, done: stats[g.id] })),
      anniversaryDue: anniversaryDue(new Date(p.since), p.anniversaries),
      ...status(p.other),
    }
  })
  const relatives = rels.rows.map((r) => {
    const role = roleFor(userId, r.a_id, r.role_of_b)
    return { userId: r.other, username: r.name, appearance: r.appearance, role, roleLabel: ROLE_LABEL[role] ?? role, ...status(r.other) }
  })
  return {
    ok: true as const,
    maxBaes: MAX_BAES,
    hideStatus: hidden,
    baes,
    relatives,
    incoming: reqs.rows.filter((r) => r.to_id === userId).map((r) => publicRequest(r, userId)),
    outgoing: reqs.rows.filter((r) => r.from_id === userId).map((r) => publicRequest(r, userId)),
    events: ev.rows.map((e) => ({ id: e.id, kind: e.kind, body: e.body, at: new Date(e.created_at).toISOString() })),
    dateSpots: DATE_SPOTS,
  }
}

export async function markEventsSeen(userId: string) {
  await pool.query(`UPDATE family_events SET seen = TRUE WHERE user_id = $1 AND NOT seen`, [userId])
  return { ok: true as const }
}

/** What a player card shows about one other player. */
export async function withPlayer(userId: string, username: string) {
  const other = await userByName(username)
  if (!other || other.id === userId) return fail(404, 'No such player.')
  await expireOld()
  const [x, y] = pairOf(userId, other.id)
  const [pts, pair, rel, req, hidden, open, decl, mine] = await Promise.all([
    closenessOf(userId, other.id),
    pairBetween(userId, other.id),
    pool.query<{ role_of_b: string; a_id: string }>(`SELECT role_of_b, a_id FROM relatives WHERE a_id = $1 AND b_id = $2`, [x, y]),
    pool.query<ReqRow>(`${REQ_SELECT} WHERE r.status = 'pending' AND ((r.from_id = $1 AND r.to_id = $2) OR (r.from_id = $2 AND r.to_id = $1))`, [userId, other.id]),
    hiddenStatus(other.id),
    openBaeCount(other.id),
    pool.query<{ answered_at: Date }>(
      `SELECT answered_at FROM family_requests WHERE from_id = $1 AND to_id = $2 AND kind = 'bae' AND status = 'declined' ORDER BY answered_at DESC LIMIT 1`,
      [userId, other.id],
    ),
    baeCount(userId),
  ])
  const gate = closenessGate(pts)
  const bae = req.rows.find((r) => r.kind === 'bae')
  const relative = req.rows.find((r) => r.kind === 'relative')
  const wait = cooldownLeftHours(decl.rows[0]?.answered_at ? new Date(decl.rows[0].answered_at) : null)
  const relRow = rel.rows[0]
  return {
    ok: true as const,
    closeness: pts,
    needed: BAE_CLOSENESS_NEEDED,
    progress: gate.progress,
    unlocked: gate.unlocked,
    baes: !!pair,
    sneaky: pair ? (pair.a_id === userId ? pair.sneaky_by_a : pair.sneaky_by_b) : false,
    pendingBae: bae ? publicRequest(bae, userId) : null,
    pendingRelative: relative ? publicRequest(relative, userId) : null,
    relativeRole: relRow ? roleFor(userId, relRow.a_id, relRow.role_of_b) : null,
    cooldownHours: wait,
    theirStatus: statusLabel(open, hidden),
    iAmFull: mine >= MAX_BAES,
  }
}

export async function setSneaky(userId: string, username: string, on: boolean) {
  const other = await userByName(username)
  if (!other) return fail(404, 'No such player.')
  const pair = await pairBetween(userId, other.id)
  if (!pair) return fail(404, 'You are not baes.')
  const col = pair.a_id === userId ? 'sneaky_by_a' : 'sneaky_by_b'
  if (on) {
    const have = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM bae_pairs WHERE (a_id = $1 AND sneaky_by_a) OR (b_id = $1 AND sneaky_by_b)`,
      [userId],
    )
    if ((have.rows[0]?.n ?? 0) >= 1) return fail(409, 'You can only have one 🤫 sneaky link.')
  }
  await pool.query(`UPDATE bae_pairs SET ${col} = $3 WHERE a_id = $1 AND b_id = $2`, [pair.a_id, pair.b_id, on])
  return listFamily(userId)
}

export async function breakUp(userId: string, username: string) {
  const other = await userByName(username)
  if (!other) return fail(404, 'No such player.')
  const [a, b] = pairOf(userId, other.id)
  const r = await pool.query(`DELETE FROM bae_pairs WHERE a_id = $1 AND b_id = $2 RETURNING 1`, [a, b])
  if (!r.rows.length) return fail(404, 'You are not baes.')
  await pool.query(`DELETE FROM partner_optins WHERE (user_id = $1 AND with_id = $2) OR (user_id = $2 AND with_id = $1)`, [userId, other.id])
  const me = await pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userId])
  await addEvent(other.id, 'breakup', `@${me.rows[0]?.username ?? 'Someone'} ended things 💔`)
  return listFamily(userId)
}

export async function removeRelative(userId: string, username: string) {
  const other = await userByName(username)
  if (!other) return fail(404, 'No such player.')
  const [a, b] = pairOf(userId, other.id)
  await pool.query(`DELETE FROM relatives WHERE a_id = $1 AND b_id = $2`, [a, b])
  return listFamily(userId)
}

/** Blocking ends everything between two players. */
export async function endAllBetween(x: string, y: string) {
  const [a, b] = pairOf(x, y)
  await pool.query(`DELETE FROM bae_pairs WHERE a_id = $1 AND b_id = $2`, [a, b])
  await pool.query(`DELETE FROM relatives WHERE a_id = $1 AND b_id = $2`, [a, b])
  await pool.query(
    `UPDATE family_requests SET status = 'cancelled', answered_at = NOW() WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
    [x, y],
  )
}

/* —— Dates, anniversaries, goals —— */

async function giveNeeds(client: PoolClient, userId: string, delta: Partial<Needs>) {
  const row = await client.query<{ character_id: string; needs: Needs | string }>(
    `SELECT g.character_id, g.needs FROM game_state g JOIN characters c ON c.id = g.character_id WHERE c.user_id = $1 FOR UPDATE OF g`,
    [userId],
  )
  const r = row.rows[0]
  if (!r) return
  await client.query(`UPDATE game_state SET needs = $2::jsonb, updated_at = NOW() WHERE character_id = $1`, [r.character_id, JSON.stringify(applyNeedDelta(parseNeeds(r.needs), delta))])
}

async function dateCooldownLeft(a: string, b: string): Promise<number> {
  const r = await pool.query<{ left: number }>(
    `SELECT GREATEST(0, CEIL($4 - EXTRACT(EPOCH FROM (NOW() - last_at))))::int AS left FROM closeness_log WHERE a_id = $1 AND b_id = $2 AND kind = $3`,
    [a, b, 'date', DATE_COOLDOWN_SEC],
  )
  return r.rows[0]?.left ?? 0
}

export async function planDate(userId: string, username: string, spotId: string) {
  const spot = DATE_SPOTS.find((s) => s.id === spotId)
  if (!spot) return fail(400, 'Pick a date spot.')
  const other = await userByName(username)
  if (!other) return fail(404, 'No such player.')
  if (await blocked(userId, other.id)) return fail(403, 'You cannot do that.')
  const pair = await pairBetween(userId, other.id)
  if (!pair) return fail(404, 'You are not baes.')
  const [a, b] = pairOf(userId, other.id)
  const left = await dateCooldownLeft(a, b)
  if (left > 0) return fail(429, `You two just had a date. Try again in ${Math.ceil(left / 60)} min.`)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (spot.cost > 0) {
      const ch = await client.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [userId])
      const cid = ch.rows[0]?.id
      if (!cid) {
        await client.query('ROLLBACK')
        return fail(409, 'Finish setting up your character first.')
      }
      const paid = await applyCash(client, cid, -spot.cost, `Date: ${spot.label}`, 'date')
      if (!paid.ok) {
        await client.query('ROLLBACK')
        return fail(402, 'Not enough cash for that date.')
      }
    }
    for (const id of [a, b]) await giveNeeds(client, id, spot.needs)
    await client.query(
      `INSERT INTO closeness_log (a_id, b_id, kind, last_at) VALUES ($1, $2, 'date', NOW()) ON CONFLICT (a_id, b_id, kind) DO UPDATE SET last_at = NOW()`,
      [a, b],
    )
    await client.query(
      `INSERT INTO player_relations (a_id, b_id, points) VALUES ($1, $2, $3) ON CONFLICT (a_id, b_id) DO UPDATE SET points = player_relations.points + EXCLUDED.points, updated_at = NOW()`,
      [a, b, spot.closeness],
    )
    await client.query(`UPDATE bae_pairs SET dates = dates + 1 WHERE a_id = $1 AND b_id = $2`, [a, b])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  void postNudge(userId, other.id, 'date').catch(() => {})
  const caught = await maybeCaught(userId, other.id, pair)
  return { ok: true as const, spot, caught, family: await listFamily(userId) }
}

/** A date with your sneaky link can get noticed: your main bae hears gist. */
export async function maybeCaught(userId: string, otherId: string, pair: PairRow, roll = Math.random()): Promise<boolean> {
  const sneakyDate = pair.a_id === userId ? pair.sneaky_by_a : pair.sneaky_by_b
  if (!sneakyDate || roll >= CAUGHT_CHANCE) return false
  const main = await pool.query<{ other: string }>(
    `SELECT CASE WHEN p.a_id = $1 THEN p.b_id ELSE p.a_id END AS other
     FROM bae_pairs p
     WHERE ((p.a_id = $1 AND NOT p.sneaky_by_a) OR (p.b_id = $1 AND NOT p.sneaky_by_b)) AND CASE WHEN p.a_id = $1 THEN p.b_id ELSE p.a_id END <> $2
     ORDER BY p.since LIMIT 1`,
    [userId, otherId],
  )
  const me = await pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userId])
  const name = me.rows[0]?.username ?? 'Someone'
  await addEvent(otherId, 'caught', `Your sneaky date got spotted 👀 @${name}'s main bae may have heard.`)
  const m = main.rows[0]
  if (m) await addEvent(m.other, 'drama', `🍿 Drama! Gist reach you: @${name} was seen on a date with somebody else 👀`)
  return true
}

export async function claimAnniversary(userId: string, username: string) {
  const other = await userByName(username)
  if (!other) return fail(404, 'No such player.')
  const pair = await pairBetween(userId, other.id)
  if (!pair) return fail(404, 'You are not baes.')
  if (!anniversaryDue(new Date(pair.since), pair.anniversaries)) return fail(409, 'Not your anniversary yet.')
  const [a, b] = pairOf(userId, other.id)
  const upd = await pool.query(`UPDATE bae_pairs SET anniversaries = anniversaries + 1 WHERE a_id = $1 AND b_id = $2 AND anniversaries = $3 RETURNING 1`, [a, b, pair.anniversaries])
  if (!upd.rows.length) return fail(409, 'Already claimed.')
  await pool.query(`INSERT INTO player_relations (a_id, b_id, points) VALUES ($1, $2, 10) ON CONFLICT (a_id, b_id) DO UPDATE SET points = player_relations.points + 10`, [a, b])
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const id of [a, b]) await giveNeeds(client, id, { fun: 10, social: 10 })
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  return listFamily(userId)
}

/** Called after an interaction landed: counts toward the couple's goals (and "close enough to be baes" is already points). */
export async function recordInteraction(from: string, to: string, action: string) {
  const kind = goalKind(action)
  if (!kind) return
  const [a, b] = pairOf(from, to)
  await pool.query(`UPDATE bae_pairs SET ${kind} = ${kind} + 1 WHERE a_id = $1 AND b_id = $2`, [a, b])
}

/** Dev only: jump a pair to the closeness needed (so two test accounts can try the flow). */
export async function devSeedCloseness(userId: string, username: string, points = BAE_CLOSENESS_NEEDED) {
  const other = await userByName(username)
  if (!other || other.id === userId) return fail(404, 'No such player.')
  const [a, b] = pairOf(userId, other.id)
  await pool.query(
    `INSERT INTO player_relations (a_id, b_id, points) VALUES ($1, $2, $3) ON CONFLICT (a_id, b_id) DO UPDATE SET points = GREATEST(player_relations.points, EXCLUDED.points)`,
    [a, b, points],
  )
  return { ok: true as const, points }
}

/** Phone notification items for the Family app. */
export async function familyNotifications(userId: string) {
  await expireOld()
  const [reqs, ev] = await Promise.all([
    pool.query<ReqRow>(`${REQ_SELECT} WHERE r.status = 'pending' AND r.to_id = $1`, [userId]),
    pool.query<{ id: string; body: string; created_at: Date }>(`SELECT id, body, created_at FROM family_events WHERE user_id = $1 AND NOT seen AND created_at > NOW() - INTERVAL '7 days'`, [userId]),
  ])
  return [
    ...reqs.rows.map((r) => ({
      id: `fam-req-${r.id}`,
      title: r.kind === 'bae' ? 'Bae request 💕' : 'Family request 👪',
      body: r.kind === 'bae' ? `@${r.from_name} wants to be your bae.` : `@${r.from_name} wants to add you as family.`,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    ...ev.rows.map((e) => ({ id: `fam-ev-${e.id}`, title: 'Family', body: e.body, createdAt: new Date(e.created_at).toISOString() })),
  ]
}

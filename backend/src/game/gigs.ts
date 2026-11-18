import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { applyCash, asMoney } from './game-state.js'
import { requireEconomySetup } from './economy.js'
import { withIdempotency } from './idempotency.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import {
  autoAcceptAt,
  budgetLeft,
  canMove,
  cleanGigText,
  cleanMoney,
  escrowFor,
  GIG_3D_CATEGORIES,
  GIG_CATEGORY_LABEL,
  GIG_LIMITS,
  isCategory,
  nextRankFor,
  keyOpen,
  rankFor,
  startAtFrom,
  type GigCategory,
  type GigStatus,
} from './gigs-rules.js'

/*
 * Gigs: a player-to-player job market. The fee (plus an optional item budget) is held in escrow
 * when the owner hires, paid to the worker when the owner accepts (or 24h after "done"), and
 * refunded on cancel. Every state change locks the gig row and checks its status, so a repeated
 * or racing request can never move money twice; money routes also carry an Idempotency-Key.
 * The 3D work (decorating, cleaning) lives in gigs-home.ts.
 */

export type GigFail = { ok: false; error: string; code: number; reason?: string }
const fail = (error: string, code = 400, reason?: string): GigFail => ({ ok: false, error, code, reason })
const ONLINE_WINDOW = '5 minutes'

export type GigRow = {
  id: string
  owner_id: string
  worker_id: string | null
  direct_to: string | null
  category: GigCategory
  title: string
  details: string
  fee: string | number
  budget: string | number
  budget_spent: string | number
  escrow: string | number
  status: GigStatus
  start_at: Date
  expires_at: Date
  hired_at: Date | null
  started_at: Date | null
  done_at: Date | null
  auto_accept_at: Date | null
  completed_at: Date | null
  snapshot: unknown
  dispute_reason: string | null
  rating_worker: number | null
  rating_owner: number | null
  report_count: number
  hidden: boolean
  created_at: Date
}

export type GigPerson = {
  userId: string
  username: string
  name: string
  /** Their character's look and avatar colour, for the face on cards. */
  appearance: unknown
  avatarColor: string
  jobs: number
  rating: number | null
  rank: { id: string; label: string; emoji: string; order: number }
  /** How owners rate them (shown on posts). */
  ownerRating: number | null
  online: boolean
}

// ── people ────────────────────────────────────────────────────────────────

export async function loadPeople(db: Pick<PoolClient, 'query'>, ids: string[]): Promise<Map<string, GigPerson>> {
  const out = new Map<string, GigPerson>()
  const list = [...new Set(ids.filter(Boolean))]
  if (list.length === 0) return out
  const rows = await db.query<{
    id: string
    username: string
    name: string
    appearance: unknown
    avatar_color: string | null
    jobs: number | null
    avg: number | null
    owner_avg: number | null
    online: boolean
  }>(
    `SELECT u.id, u.username, u.name, c.appearance, pp.avatar_color, w.jobs, w.avg, o.avg AS owner_avg,
            EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.last_seen_at > NOW() - $2::interval AND s.expires_at > NOW()) AS online
     FROM users u
     LEFT JOIN characters c ON c.user_id = u.id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     LEFT JOIN (SELECT worker_id, COUNT(*)::int AS jobs, AVG(rating_worker)::float AS avg
                  FROM gigs WHERE status = 'completed' AND worker_id = ANY($1::text[]) GROUP BY worker_id) w ON w.worker_id = u.id
     LEFT JOIN (SELECT owner_id, AVG(rating_owner)::float AS avg
                  FROM gigs WHERE status = 'completed' AND owner_id = ANY($1::text[]) GROUP BY owner_id) o ON o.owner_id = u.id
     WHERE u.id = ANY($1::text[])`,
    [list, ONLINE_WINDOW],
  )
  for (const r of rows.rows) {
    const jobs = r.jobs ?? 0
    const rating = r.avg == null ? null : Math.round(r.avg * 10) / 10
    out.set(r.id, {
      userId: r.id,
      username: r.username,
      name: r.name,
      appearance: r.appearance ?? null,
      avatarColor: r.avatar_color ?? '#3d9ad6',
      jobs,
      rating,
      rank: rankFor(jobs, r.avg),
      ownerRating: r.owner_avg == null ? null : Math.round(r.owner_avg * 10) / 10,
      online: r.online,
    })
  }
  return out
}

// ── views ─────────────────────────────────────────────────────────────────

type Applicant = { person: GigPerson; message: string; at: string }

async function viewGigs(db: Pick<PoolClient, 'query'>, viewerId: string, rows: GigRow[], withApplicants: boolean) {
  const people = await loadPeople(db, rows.flatMap((g) => [g.owner_id, g.worker_id ?? '', g.direct_to ?? '']))
  const ids = rows.map((g) => g.id)
  const apps = ids.length
    ? await db.query<{ gig_id: string; user_id: string; message: string; created_at: Date }>(
        `SELECT gig_id, user_id, message, created_at FROM gig_applications WHERE gig_id = ANY($1::text[]) ORDER BY created_at`,
        [ids],
      )
    : { rows: [] }
  const applicantPeople = await loadPeople(db, apps.rows.map((a) => a.user_id))
  const now = new Date()
  return rows.map((g) => {
    const mine = g.owner_id === viewerId
    const mineWorker = g.worker_id === viewerId
    const gigApps = apps.rows.filter((a) => a.gig_id === g.id)
    const applicants: Applicant[] =
      mine && withApplicants
        ? gigApps.flatMap((a) => {
            const person = applicantPeople.get(a.user_id)
            return person ? [{ person, message: a.message, at: a.created_at.toISOString() }] : []
          })
        : []
    const owner = people.get(g.owner_id)
    return {
      id: g.id,
      category: g.category,
      categoryLabel: GIG_CATEGORY_LABEL[g.category],
      title: g.title,
      details: g.details,
      fee: asMoney(g.fee),
      budget: asMoney(g.budget),
      budgetLeft: budgetLeft(asMoney(g.budget), asMoney(g.budget_spent)),
      escrow: asMoney(g.escrow),
      status: g.status,
      startAt: g.start_at.toISOString(),
      expiresAt: g.expires_at.toISOString(),
      doneAt: g.done_at?.toISOString() ?? null,
      autoAcceptAt: g.auto_accept_at?.toISOString() ?? null,
      createdAt: g.created_at.toISOString(),
      role: mine ? ('owner' as const) : mineWorker ? ('worker' as const) : g.direct_to === viewerId ? ('offered' as const) : ('viewer' as const),
      owner: owner ?? null,
      worker: g.worker_id ? (people.get(g.worker_id) ?? null) : null,
      directTo: g.direct_to ? (people.get(g.direct_to) ?? null) : null,
      applicantCount: gigApps.length,
      applied: gigApps.some((a) => a.user_id === viewerId),
      applicants,
      /** What the viewer rated / was rated (1-5) */
      ratingForWorker: g.rating_worker,
      ratingForOwner: g.rating_owner,
      disputeReason: g.dispute_reason,
      hidden: g.hidden,
      reported: false,
      is3D: GIG_3D_CATEGORIES.includes(g.category),
      keyOpen: mineWorker ? keyOpen(g.status, g.start_at, g.expires_at, now) : false,
      houseOwner: mineWorker ? (owner?.username ?? null) : null,
      canUndo: mine && Boolean(g.snapshot) && ['working', 'done', 'completed', 'disputed'].includes(g.status),
    }
  })
}
export type GigView = Awaited<ReturnType<typeof viewGigs>>[number]

const GIG_COLS = `g.*`

/** A search box's text as an ILIKE pattern (or null when empty). */
const likeOf = (q?: string | null) => {
  const t = (q ?? '').trim().slice(0, 40).replace(/[%_\\]/g, (m) => `\\${m}`)
  return t ? `%${t}%` : null
}

export async function listBoard(userId: string, category?: string | null, q?: string | null) {
  await sweepGigs()
  const cat = category && isCategory(category) ? category : null
  const rows = await pool.query<GigRow>(
    `SELECT ${GIG_COLS} FROM gigs g
     WHERE g.status = 'open' AND g.hidden = FALSE AND g.direct_to IS NULL AND g.owner_id <> $1 AND g.expires_at > NOW()
       AND ($2::text IS NULL OR g.category = $2)
       AND ($3::text IS NULL OR g.title ILIKE $3 OR g.details ILIKE $3 OR EXISTS (SELECT 1 FROM users uo WHERE uo.id = g.owner_id AND uo.username ILIKE $3))
     ORDER BY g.fee DESC, g.created_at DESC LIMIT 60`,
    [userId, cat, likeOf(q)],
  )
  return { ok: true as const, gigs: await viewGigs(pool, userId, rows.rows, false) }
}

export async function listMine(userId: string) {
  await sweepGigs()
  const rows = await pool.query<GigRow>(`SELECT ${GIG_COLS} FROM gigs g WHERE g.owner_id = $1 ORDER BY g.created_at DESC LIMIT 50`, [userId])
  return { ok: true as const, gigs: await viewGigs(pool, userId, rows.rows, true) }
}

/** Jobs I'm doing, plus direct offers made to me. */
export async function listWorking(userId: string) {
  await sweepGigs()
  const rows = await pool.query<GigRow>(
    `SELECT ${GIG_COLS} FROM gigs g
     WHERE (g.worker_id = $1 AND g.status IN ('hired','working','done','disputed','completed','cancelled'))
        OR (g.direct_to = $1 AND g.status = 'open' AND g.expires_at > NOW())
     ORDER BY (g.status IN ('hired','working','done','disputed')) DESC, g.created_at DESC LIMIT 50`,
    [userId],
  )
  return { ok: true as const, gigs: await viewGigs(pool, userId, rows.rows, false) }
}

export async function getGig(userId: string, gigId: string) {
  const rows = await pool.query<GigRow>(`SELECT ${GIG_COLS} FROM gigs g WHERE g.id = $1`, [gigId])
  const g = rows.rows[0]
  if (!g || (g.hidden && g.owner_id !== userId)) return fail('That job is not there.', 404)
  if (g.status !== 'open' && g.owner_id !== userId && g.worker_id !== userId && g.direct_to !== userId) return fail('That job is not there.', 404)
  return { ok: true as const, gig: (await viewGigs(pool, userId, [g], true))[0]! }
}

// ── pros (Find a pro) ─────────────────────────────────────────────────────

export type ProView = GigPerson & { categories: GigCategory[]; fromPrice: number; pitch: string; free: boolean; isMe: boolean }

export async function listPros(userId: string, category?: string | null, q?: string | null) {
  const cat = category && isCategory(category) ? category : null
  const rows = await pool.query<{ user_id: string; categories: string[]; from_price: string | number; pitch: string; busy: boolean }>(
    `SELECT p.user_id, p.categories, p.from_price, p.pitch,
            EXISTS (SELECT 1 FROM gigs g WHERE g.worker_id = p.user_id AND g.status IN ('hired','working')) AS busy
     FROM gig_pros p
     WHERE p.active AND p.report_count < $2 AND ($1::text IS NULL OR $1 = ANY(p.categories))
       AND ($3::text IS NULL OR p.pitch ILIKE $3 OR EXISTS (SELECT 1 FROM users up WHERE up.id = p.user_id AND up.username ILIKE $3))
     ORDER BY p.created_at DESC LIMIT 120`,
    [cat, GIG_LIMITS.hideAtReports, likeOf(q)],
  )
  const people = await loadPeople(pool, rows.rows.map((r) => r.user_id))
  const pros: ProView[] = rows.rows.flatMap((r) => {
    const person = people.get(r.user_id)
    if (!person) return []
    return [
      {
        ...person,
        categories: r.categories.filter(isCategory),
        fromPrice: asMoney(r.from_price),
        pitch: r.pitch,
        free: !r.busy,
        isMe: r.user_id === userId,
      },
    ]
  })
  // Higher rank first, then best rating, then more jobs, online and free first among equals
  pros.sort(
    (a, b) =>
      b.rank.order - a.rank.order ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      b.jobs - a.jobs ||
      Number(b.online && b.free) - Number(a.online && a.free),
  )
  const mine = await pool.query<{ categories: string[]; from_price: string | number; pitch: string; active: boolean }>(
    `SELECT categories, from_price, pitch, active FROM gig_pros WHERE user_id = $1`,
    [userId],
  )
  const m = mine.rows[0]
  return {
    ok: true as const,
    pros,
    mine: m ? { categories: m.categories.filter(isCategory), fromPrice: asMoney(m.from_price), pitch: m.pitch, active: m.active } : null,
  }
}

export async function saveMyPro(userId: string, body: { categories: unknown; fromPrice: unknown; pitch: unknown }) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const cats = Array.isArray(body.categories) ? [...new Set(body.categories.filter(isCategory))] : []
  if (cats.length === 0) return fail('Pick at least one thing you do.')
  const price = cleanMoney(body.fromPrice, 0, GIG_LIMITS.feeMax)
  if (price === null) return fail('Enter a from-price in whole naira.')
  const pitch = cleanGigText(body.pitch, GIG_LIMITS.pitchMax, { label: 'Your pitch' })
  if (!pitch.ok) return fail(pitch.error)
  await pool.query(
    `INSERT INTO gig_pros (user_id, categories, from_price, pitch, active) VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET categories = EXCLUDED.categories, from_price = EXCLUDED.from_price, pitch = EXCLUDED.pitch, active = TRUE`,
    [userId, cats, price, pitch.text],
  )
  return { ok: true as const }
}

export async function removeMyPro(userId: string) {
  await pool.query(`UPDATE gig_pros SET active = FALSE WHERE user_id = $1`, [userId])
  return { ok: true as const }
}

// ── transactions ──────────────────────────────────────────────────────────

type Ctx = { client: PoolClient; userId: string; characterId: string }
type Run = { status: number; body: Record<string, unknown> }

/** One write in a transaction, idempotent per (player, route, key). */
export async function writeGig(userId: string, key: string, route: string, body: unknown, run: (ctx: Ctx) => Promise<Run>) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key,
      route,
      body,
      run: () => run({ client, userId, characterId: gate.character.id }),
    })
    await client.query('COMMIT')
    const out = result.body as Record<string, unknown>
    if (out.ok !== true) return fail((out.error as string) ?? 'Request failed.', result.status, out.reason as string | undefined)
    return { ok: true as const, ...out }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export const bad = (error: string, status = 400, reason?: string): Run => ({ status, body: { ok: false, error, reason } })
export const good = (body: Record<string, unknown> = {}): Run => ({ status: 200, body: { ok: true, ...body } })

export async function lockGig(client: PoolClient, id: string): Promise<GigRow | null> {
  const r = await client.query<GigRow>(`SELECT * FROM gigs WHERE id = $1 FOR UPDATE`, [id])
  return r.rows[0] ?? null
}

export async function characterOf(db: Pick<PoolClient, 'query'>, userId: string): Promise<string | null> {
  const r = await db.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [userId])
  return r.rows[0]?.id ?? null
}

export async function logEvent(client: PoolClient, gigId: string, kind: string, amount: number, userId: string | null) {
  await client.query(`INSERT INTO gig_events (id, gig_id, kind, amount, user_id) VALUES ($1, $2, $3, $4, $5)`, [createId(), gigId, kind, amount, userId])
}

/** Lock both players' wallets in a fixed order so two jobs between the same people can't deadlock. */
async function lockWallets(client: PoolClient, characterIds: string[]) {
  await client.query(`SELECT 1 FROM game_state WHERE character_id = ANY($1::text[]) ORDER BY character_id FOR UPDATE`, [characterIds])
}

export type PostBody = { category: unknown; title: unknown; details: unknown; fee: unknown; budget: unknown; startInHours: unknown; directTo?: unknown }

export function postGig(userId: string, body: PostBody, key: string) {
  return writeGig(userId, key, 'POST /gigs', body, async ({ client, characterId }) => {
    if (!isCategory(body.category)) return bad('Pick what kind of job it is.')
    const title = cleanGigText(body.title, GIG_LIMITS.titleMax, { required: true, label: 'The title' })
    if (!title.ok) return bad(title.error)
    const details = cleanGigText(body.details, GIG_LIMITS.detailsMax, { label: 'The details' })
    if (!details.ok) return bad(details.error)
    const fee = cleanMoney(body.fee, GIG_LIMITS.feeMin, GIG_LIMITS.feeMax)
    if (fee === null) return bad(`The fee must be a whole amount from ₦${GIG_LIMITS.feeMin}.`)
    const budget = body.category === 'decorator' ? cleanMoney(body.budget ?? 0, 0, GIG_LIMITS.budgetMax) : 0
    if (budget === null) return bad('The item budget must be a whole amount of naira.')
    const hours = typeof body.startInHours === 'number' ? body.startInHours : 0
    const when = startAtFrom(hours, new Date())
    if (!when) return bad('Pick when it should start.')
    const direct = typeof body.directTo === 'string' && body.directTo ? body.directTo : null
    if (direct) {
      if (direct === userId) return bad('You cannot hire yourself.')
      const pro = await client.query(`SELECT 1 FROM gig_pros WHERE user_id = $1 AND active AND $2 = ANY(categories)`, [direct, body.category])
      if (!pro.rows[0]) return bad('That player does not do this kind of job.')
    }
    const cash = await client.query<{ cash: string | number }>(`SELECT cash FROM game_state WHERE character_id = $1`, [characterId])
    if (asMoney(cash.rows[0]?.cash ?? 0) < escrowFor(fee, budget)) return bad('You need the fee (and item budget) in your wallet to post this job.', 400, 'INSUFFICIENT_FUNDS')
    const open = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM gigs WHERE owner_id = $1 AND status = 'open'`, [userId])
    if ((open.rows[0]?.n ?? 0) >= GIG_LIMITS.openPostsMax) return bad(`You can have ${GIG_LIMITS.openPostsMax} open jobs at a time.`)
    const id = `gig_${createId()}`
    await client.query(
      `INSERT INTO gigs (id, owner_id, direct_to, category, title, details, fee, budget, start_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, userId, direct, body.category, title.text, details.text, fee, budget, when.startAt, when.expiresAt],
    )
    return good({ id, message: direct ? 'Offer sent.' : 'Job posted.' })
  })
}

export function applyToGig(userId: string, gigId: string, rawMessage: unknown, key: string) {
  return writeGig(userId, key, 'POST /gigs/apply', { gigId, rawMessage }, async ({ client }) => {
    const message = cleanGigText(rawMessage, GIG_LIMITS.messageMax, { label: 'Your message' })
    if (!message.ok) return bad(message.error)
    const g = await lockGig(client, gigId)
    if (!g || g.hidden || g.direct_to) return bad('That job is not there.', 404)
    if (g.status !== 'open' || g.expires_at <= new Date()) return bad('That job is not open any more.', 409)
    if (g.owner_id === userId) return bad('This is your own job.')
    await client.query(
      `INSERT INTO gig_applications (gig_id, user_id, message) VALUES ($1, $2, $3)
       ON CONFLICT (gig_id, user_id) DO UPDATE SET message = EXCLUDED.message`,
      [gigId, userId, message.text],
    )
    return good({ message: 'Applied. The owner will see you.' })
  })
}

export function withdrawApplication(userId: string, gigId: string) {
  return pool.query(`DELETE FROM gig_applications WHERE gig_id = $1 AND user_id = $2`, [gigId, userId]).then(() => ({ ok: true as const }))
}

/** Hold fee + budget from the owner and give the worker the job. Shared by "hire an applicant" and "accept a direct offer". */
async function holdAndHire(ctx: Ctx, g: GigRow, workerId: string): Promise<Run> {
  const { client } = ctx
  if (g.status !== 'open' || g.expires_at <= new Date()) return bad('That job is not open any more.', 409)
  if (workerId === g.owner_id) return bad('You cannot hire yourself.')
  const ownerChar = await characterOf(client, g.owner_id)
  const workerChar = await characterOf(client, workerId)
  if (!ownerChar || !workerChar) return bad('That player is not ready to play yet.', 409)
  const block = await liveSpaceMoneyBlock([g.owner_id], client)
  if (block) return bad(block, 400, 'LIVE_SPACE')
  await lockWallets(client, [ownerChar, workerChar])
  const hold = escrowFor(asMoney(g.fee), asMoney(g.budget))
  const wrote = await applyCash(client, ownerChar, -hold, `Gig held: ${g.title}`, 'gig_escrow')
  if (!wrote.ok) return bad(wrote.error === 'INSUFFICIENT_FUNDS' ? 'The owner does not have the fee in their wallet.' : wrote.error, 400, 'INSUFFICIENT_FUNDS')
  const now = new Date()
  const startAt = g.start_at > now ? g.start_at : now
  const expiresAt = new Date(startAt.getTime() + GIG_LIMITS.windowH * 3_600_000)
  await client.query(
    `UPDATE gigs SET status = 'hired', worker_id = $2, escrow = $3, hired_at = NOW(), start_at = $4, expires_at = $5 WHERE id = $1`,
    [g.id, workerId, hold, startAt, expiresAt],
  )
  await client.query(`DELETE FROM gig_applications WHERE gig_id = $1 AND user_id <> $2`, [g.id, workerId])
  await logEvent(client, g.id, 'escrow_held', hold, g.owner_id)
  return good({ message: `Hired. ₦${hold.toLocaleString('en-NG')} is held until the job is done.` })
}

export function hireWorker(userId: string, gigId: string, workerId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/hire', { gigId, workerId }, async (ctx) => {
    const g = await lockGig(ctx.client, gigId)
    if (!g || g.owner_id !== userId) return bad('That is not your job.', 404)
    if (g.direct_to) return bad('This is an offer to one player. They accept it.', 409)
    const applied = await ctx.client.query(`SELECT 1 FROM gig_applications WHERE gig_id = $1 AND user_id = $2`, [gigId, workerId])
    if (!applied.rows[0]) return bad('That player did not apply.', 400)
    return holdAndHire(ctx, g, workerId)
  })
}

/** The pro who was booked directly says yes (money is held now) or no. */
export function respondToOffer(userId: string, gigId: string, accept: boolean, key: string) {
  return writeGig(userId, key, 'POST /gigs/offer', { gigId, accept }, async (ctx) => {
    const g = await lockGig(ctx.client, gigId)
    if (!g || g.direct_to !== userId) return bad('That offer is not for you.', 404)
    if (g.status !== 'open') return bad('That offer is not open any more.', 409)
    if (!accept) {
      await ctx.client.query(`UPDATE gigs SET status = 'cancelled' WHERE id = $1`, [gigId])
      return good({ message: 'Offer declined.' })
    }
    return holdAndHire(ctx, g, userId)
  })
}

/** Pay out or refund what is held, in one transaction (the gig row is already locked by the caller). */
async function settle(client: PoolClient, g: GigRow, to: 'worker' | 'owner', by: string): Promise<GigRow> {
  const ownerChar = await characterOf(client, g.owner_id)
  const workerChar = g.worker_id ? await characterOf(client, g.worker_id) : null
  if (!ownerChar) throw new Error('owner has no character')
  await lockWallets(client, [ownerChar, ...(workerChar ? [workerChar] : [])])
  const fee = asMoney(g.fee)
  const left = budgetLeft(asMoney(g.budget), asMoney(g.budget_spent))
  if (to === 'worker') {
    if (!workerChar) throw new Error('worker has no character')
    const paid = await applyCash(client, workerChar, fee, `Gig pay: ${g.title}`, 'gig_pay')
    if (!paid.ok) throw new Error(paid.error)
    await logEvent(client, g.id, 'paid_worker', fee, g.worker_id)
    if (left > 0) {
      const back = await applyCash(client, ownerChar, left, `Gig item budget left: ${g.title}`, 'gig_refund')
      if (!back.ok) throw new Error(back.error)
      await logEvent(client, g.id, 'refund_budget', left, g.owner_id)
    }
    const r = await client.query<GigRow>(`UPDATE gigs SET status = 'completed', escrow = 0, completed_at = NOW() WHERE id = $1 RETURNING *`, [g.id])
    await logEvent(client, g.id, `completed_by_${by}`, 0, null)
    return r.rows[0]!
  }
  const refund = fee + left
  if (refund > 0) {
    const back = await applyCash(client, ownerChar, refund, `Gig refunded: ${g.title}`, 'gig_refund')
    if (!back.ok) throw new Error(back.error)
    await logEvent(client, g.id, 'refund_owner', refund, g.owner_id)
  }
  const r = await client.query<GigRow>(`UPDATE gigs SET status = 'cancelled', escrow = 0 WHERE id = $1 RETURNING *`, [g.id])
  await logEvent(client, g.id, `cancelled_by_${by}`, 0, null)
  return r.rows[0]!
}

export function acceptWork(userId: string, gigId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/accept', { gigId }, async ({ client }) => {
    const g = await lockGig(client, gigId)
    if (!g || g.owner_id !== userId) return bad('That is not your job.', 404)
    if (g.status === 'completed') return good({ message: 'Already paid.' })
    if (!canMove(g.status, 'completed')) return bad('The worker has not marked this done yet.', 409)
    const done = await settle(client, g, 'worker', 'owner')
    return good({ message: `Paid ₦${asMoney(done.fee).toLocaleString('en-NG')} to the worker.` })
  })
}

/** Owner backs out. Only before work starts: the held money goes back in full. */
export function cancelGig(userId: string, gigId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/cancel', { gigId }, async ({ client }) => {
    const g = await lockGig(client, gigId)
    if (!g) return bad('That job is not there.', 404)
    const isOwner = g.owner_id === userId
    const isWorker = g.worker_id === userId
    if (!isOwner && !isWorker) return bad('That is not your job.', 404)
    if (g.status === 'cancelled') return good({ message: 'Already cancelled.' })
    if (g.status === 'open') {
      if (!isOwner) return bad('That is not your job.', 404)
      await client.query(`UPDATE gigs SET status = 'cancelled' WHERE id = $1`, [gigId])
      return good({ message: 'Job cancelled.' })
    }
    if (g.status !== 'hired') return bad('Work has started. Ask the worker, or use Dispute after it is marked done.', 409)
    await settle(client, g, 'owner', isOwner ? 'owner' : 'worker')
    return good({ message: 'Cancelled. Your money is back.' })
  })
}

/** Worker begins: takes the layout snapshot the owner can undo to. */
export async function startGigTx(client: PoolClient, g: GigRow): Promise<GigRow> {
  if (g.status === 'working') return g
  let snapshot: unknown = null
  if (g.category === 'decorator') {
    const ownerChar = await characterOf(client, g.owner_id)
    if (ownerChar) {
      const rows = await client.query(`SELECT id, item_id, x, z, rot, finish, stored, paid FROM home_placements WHERE character_id = $1`, [ownerChar])
      snapshot = rows.rows
    }
  }
  const r = await client.query<GigRow>(
    `UPDATE gigs SET status = 'working', started_at = NOW(), snapshot = COALESCE($2::jsonb, snapshot) WHERE id = $1 RETURNING *`,
    [g.id, snapshot ? JSON.stringify(snapshot) : null],
  )
  return r.rows[0]!
}

export function startWork(userId: string, gigId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/start', { gigId }, async ({ client }) => {
    const g = await lockGig(client, gigId)
    if (!g || g.worker_id !== userId) return bad('That is not your job.', 404)
    if (g.status === 'working') return good({ message: 'Already started.' })
    if (!canMove(g.status, 'working')) return bad('This job cannot be started now.', 409)
    if (!keyOpen(g.status, g.start_at, g.expires_at, new Date())) return bad(`It starts ${g.start_at.toLocaleString('en-NG')}.`, 409, 'NOT_YET')
    await startGigTx(client, g)
    return good({ message: 'Started.' })
  })
}

export function markDone(userId: string, gigId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/done', { gigId }, async ({ client }) => {
    const g = await lockGig(client, gigId)
    if (!g || g.worker_id !== userId) return bad('That is not your job.', 404)
    if (g.status === 'done') return good({ message: 'Already marked done.' })
    if (!canMove(g.status, 'done')) return bad('This job cannot be marked done now.', 409)
    if (!keyOpen(g.status, g.start_at, g.expires_at, new Date())) return bad('This job has not started yet.', 409, 'NOT_YET')
    if (g.category === 'cleaner') {
      // A cleaner has to have cleared something, unless the house has nothing left to clean
      const cleared = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM house_mess WHERE gig_id = $1`, [gigId])
      const open = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM house_mess WHERE owner_id = $1 AND cleared_at IS NULL`, [g.owner_id])
      if ((cleared.rows[0]?.n ?? 0) === 0 && (open.rows[0]?.n ?? 0) > 0) return bad('Clear at least one mess in the house first.', 409, 'NOTHING_CLEANED')
    }
    const done = new Date()
    await client.query(`UPDATE gigs SET status = 'done', done_at = $2, auto_accept_at = $3 WHERE id = $1`, [gigId, done, autoAcceptAt(done)])
    return good({ message: 'Marked done. The owner has 24 hours to accept; then you are paid automatically.' })
  })
}

export function disputeGig(userId: string, gigId: string, rawReason: unknown, key: string) {
  return writeGig(userId, key, 'POST /gigs/dispute', { gigId, rawReason }, async ({ client }) => {
    const reason = cleanGigText(rawReason, GIG_LIMITS.reasonMax, { required: true, label: 'The reason' })
    if (!reason.ok) return bad(reason.error)
    const g = await lockGig(client, gigId)
    if (!g || g.owner_id !== userId) return bad('That is not your job.', 404)
    if (g.status === 'disputed') return good({ message: 'Already with support.' })
    if (!canMove(g.status, 'disputed')) return bad('You can dispute after the worker marks it done.', 409)
    await client.query(`UPDATE gigs SET status = 'disputed', dispute_reason = $2, auto_accept_at = NULL WHERE id = $1`, [gigId, reason.text])
    await logEvent(client, gigId, 'disputed', 0, userId)
    return good({ message: 'Sent to support. The money stays held until they decide.' })
  })
}

/** Admin: decide a disputed job. */
export async function resolveDispute(gigId: string, to: 'worker' | 'owner') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const g = await lockGig(client, gigId)
    if (!g || g.status !== 'disputed') {
      await client.query('ROLLBACK')
      return fail('That job is not in dispute.', 409)
    }
    await settle(client, g, to, 'support')
    await client.query('COMMIT')
    return { ok: true as const }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function listDisputes() {
  const rows = await pool.query<GigRow & { owner_name: string; worker_name: string | null }>(
    `SELECT g.*, uo.username AS owner_name, uw.username AS worker_name FROM gigs g
     JOIN users uo ON uo.id = g.owner_id LEFT JOIN users uw ON uw.id = g.worker_id
     WHERE g.status = 'disputed' ORDER BY g.done_at`,
  )
  const reports = await pool.query<{ id: string; gig_id: string | null; gig_title: string | null; hidden: boolean | null; pro_name: string | null; reason: string; created_at: Date; reporter: string }>(
    `SELECT r.id, r.gig_id, g.title AS gig_title, g.hidden, up.username AS pro_name, r.reason, r.created_at, u.username AS reporter
       FROM gig_reports r JOIN users u ON u.id = r.reporter_id
       LEFT JOIN gigs g ON g.id = r.gig_id LEFT JOIN users up ON up.id = r.pro_id
      ORDER BY r.created_at DESC LIMIT 100`,
  )
  return {
    ok: true as const,
    disputes: rows.rows.map((g) => ({
      id: g.id,
      title: g.title,
      category: g.category,
      fee: asMoney(g.fee),
      budget: asMoney(g.budget),
      escrow: asMoney(g.escrow),
      owner: g.owner_name,
      worker: g.worker_name,
      reason: g.dispute_reason,
      doneAt: g.done_at?.toISOString() ?? null,
    })),
    reports: reports.rows.map((r) => ({
      id: r.id,
      gigId: r.gig_id,
      gigTitle: r.gig_title,
      hidden: r.hidden,
      pro: r.pro_name,
      reason: r.reason,
      reporter: r.reporter,
      createdAt: r.created_at.toISOString(),
    })),
  }
}

/** Admin: hide or show a post again. */
export async function setGigHidden(gigId: string, hidden: boolean) {
  const r = await pool.query(`UPDATE gigs SET hidden = $2 WHERE id = $1`, [gigId, hidden])
  return r.rowCount ? { ok: true as const } : fail('That job is not there.', 404)
}

/** Phone notifications for Gigs: derived from where each job stands, so they stay until the state moves on. */
export async function gigNotifications(userId: string) {
  const items: { id: string; title: string; body: string; createdAt: string }[] = []
  const rows = await pool.query<GigRow & { apps: number; owner_name: string; worker_name: string | null }>(
    `SELECT g.*, uo.username AS owner_name, uw.username AS worker_name,
            (SELECT COUNT(*)::int FROM gig_applications a WHERE a.gig_id = g.id) AS apps
       FROM gigs g JOIN users uo ON uo.id = g.owner_id LEFT JOIN users uw ON uw.id = g.worker_id
      WHERE (g.owner_id = $1 OR g.worker_id = $1 OR g.direct_to = $1)
        AND g.created_at > NOW() - INTERVAL '14 days'
        AND (g.status IN ('open','hired','working','done','disputed')
             OR (g.status IN ('completed','cancelled') AND COALESCE(g.completed_at, g.hired_at, g.created_at) > NOW() - INTERVAL '3 days'))
      ORDER BY g.created_at DESC LIMIT 30`,
    [userId],
  )
  const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`
  for (const g of rows.rows) {
    const fee = naira(asMoney(g.fee))
    const owner = g.owner_id === userId
    const worker = g.worker_id === userId
    const at = (g.done_at ?? g.hired_at ?? g.created_at).toISOString()
    if (g.status === 'open' && g.direct_to === userId) items.push({ id: `gig-offer-${g.id}`, title: 'Job offer', body: `@${g.owner_name} wants to hire you: ${g.title} (${fee}).`, createdAt: at })
    else if (g.status === 'open' && owner && g.apps > 0) items.push({ id: `gig-apps-${g.id}-${g.apps}`, title: 'New applicants', body: `${g.apps} applied to “${g.title}”. Pick one to hire.`, createdAt: g.created_at.toISOString() })
    else if ((g.status === 'hired' || g.status === 'working') && worker) items.push({ id: `gig-hired-${g.id}`, title: 'You got the job', body: `“${g.title}” for @${g.owner_name}, ${fee} is held.`, createdAt: at })
    else if (g.status === 'done' && owner) items.push({ id: `gig-done-${g.id}`, title: 'Work is done', body: `@${g.worker_name} finished “${g.title}”. Accept to pay ${fee}.`, createdAt: at })
    else if (g.status === 'done' && worker) items.push({ id: `gig-wait-${g.id}`, title: 'Waiting for OK', body: `“${g.title}”: you are paid automatically at ${g.auto_accept_at?.toLocaleString('en-NG') ?? '24h'}.`, createdAt: at })
    else if (g.status === 'disputed') items.push({ id: `gig-dispute-${g.id}`, title: 'Job with support', body: `“${g.title}” is being looked at. The money stays held.`, createdAt: at })
    else if (g.status === 'completed' && worker) items.push({ id: `gig-paid-${g.id}`, title: 'You got paid', body: `${fee} for “${g.title}”.${g.rating_owner ? '' : ' Rate the owner.'}`, createdAt: g.completed_at?.toISOString() ?? at })
    else if (g.status === 'completed' && owner && !g.rating_worker) items.push({ id: `gig-rate-${g.id}`, title: 'Rate the worker', body: `How was @${g.worker_name} on “${g.title}”?`, createdAt: g.completed_at?.toISOString() ?? at })
    else if (g.status === 'cancelled' && (owner || worker) && g.hired_at) items.push({ id: `gig-cancel-${g.id}`, title: 'Job cancelled', body: `“${g.title}” was cancelled${owner ? '. Your money is back.' : '.'}`, createdAt: at })
  }
  return items
}

/** Both sides rate once, after the job is paid. */
export function rateGig(userId: string, gigId: string, stars: unknown) {
  const n = typeof stars === 'number' ? stars : Number(stars)
  if (!Number.isInteger(n) || n < 1 || n > 5) return Promise.resolve(fail('Pick 1 to 5 stars.'))
  return (async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const g = await lockGig(client, gigId)
      if (!g || (g.owner_id !== userId && g.worker_id !== userId)) {
        await client.query('ROLLBACK')
        return fail('That is not your job.', 404)
      }
      if (g.status !== 'completed') {
        await client.query('ROLLBACK')
        return fail('You can rate after the job is paid.', 409)
      }
      const col = g.owner_id === userId ? 'rating_worker' : 'rating_owner'
      const r = await client.query(`UPDATE gigs SET ${col} = $2 WHERE id = $1 AND ${col} IS NULL`, [gigId, n])
      await client.query('COMMIT')
      if (r.rowCount === 0) return fail('You already rated this job.', 409)
      return { ok: true as const }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  })()
}

/** One report per player per post/profile; enough different reporters hide it. */
export async function reportTarget(userId: string, target: { gigId?: string; proId?: string }, rawReason: unknown) {
  const reason = cleanGigText(rawReason, GIG_LIMITS.reasonMax, { label: 'The reason' })
  if (!reason.ok) return fail(reason.error)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (target.gigId) {
      const g = await client.query<{ owner_id: string }>(`SELECT owner_id FROM gigs WHERE id = $1`, [target.gigId])
      if (!g.rows[0]) {
        await client.query('ROLLBACK')
        return fail('That job is not there.', 404)
      }
      if (g.rows[0].owner_id === userId) {
        await client.query('ROLLBACK')
        return fail('This is your own job.')
      }
      const ins = await client.query(`INSERT INTO gig_reports (id, reporter_id, gig_id, reason) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [createId(), userId, target.gigId, reason.text])
      if (ins.rowCount) {
        await client.query(
          `UPDATE gigs SET report_count = report_count + 1, hidden = (report_count + 1 >= $2) OR hidden WHERE id = $1`,
          [target.gigId, GIG_LIMITS.hideAtReports],
        )
      }
    } else if (target.proId) {
      if (target.proId === userId) {
        await client.query('ROLLBACK')
        return fail('This is your own profile.')
      }
      const ins = await client.query(`INSERT INTO gig_reports (id, reporter_id, pro_id, reason) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [createId(), userId, target.proId, reason.text])
      if (ins.rowCount) await client.query(`UPDATE gig_pros SET report_count = report_count + 1 WHERE user_id = $1`, [target.proId])
    } else {
      await client.query('ROLLBACK')
      return fail('Nothing to report.')
    }
    await client.query('COMMIT')
    return { ok: true as const, message: 'Thanks. We will look at it.' }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Housekeeping (runs before lists and on a timer): pay out jobs the owner never answered after
 * 24h, refund jobs whose worker never showed before the window closed, and close stale posts.
 */
export async function sweepGigs(): Promise<{ autoAccepted: number; refunded: number; closed: number }> {
  const out = { autoAccepted: 0, refunded: 0, closed: 0 }
  const due = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM gigs
     WHERE (status = 'done' AND auto_accept_at <= NOW())
        OR (status = 'hired' AND expires_at <= NOW())
        OR (status = 'open' AND expires_at <= NOW())
     LIMIT 25`,
  )
  for (const row of due.rows) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const g = await lockGig(client, row.id)
      if (g && g.status === 'done' && g.auto_accept_at && g.auto_accept_at <= new Date()) {
        await settle(client, g, 'worker', 'auto')
        out.autoAccepted++
      } else if (g && g.status === 'hired' && g.expires_at <= new Date()) {
        await settle(client, g, 'owner', 'expired')
        out.refunded++
      } else if (g && g.status === 'open' && g.expires_at <= new Date()) {
        await client.query(`UPDATE gigs SET status = 'cancelled' WHERE id = $1`, [g.id])
        out.closed++
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('gig sweep failed for', row.id, (error as Error).message)
    } finally {
      client.release()
    }
  }
  return out
}

/** The worker's job keys for one house right now (a decorator and/or a cleaner job, window open). */
export async function jobKeyFor(workerId: string, ownerUsername: string) {
  const rows = await pool.query<GigRow>(
    `SELECT g.* FROM gigs g JOIN users u ON u.id = g.owner_id
     WHERE g.worker_id = $1 AND LOWER(u.username) = LOWER($2) AND g.status IN ('hired','working')
       AND g.start_at <= NOW() AND g.expires_at >= NOW() AND g.category IN ('decorator','cleaner')
     ORDER BY g.start_at`,
    [workerId, ownerUsername],
  )
  const keys = rows.rows.map((g) => ({
    gigId: g.id,
    category: g.category,
    title: g.title,
    budgetLeft: budgetLeft(asMoney(g.budget), asMoney(g.budget_spent)),
    started: g.status === 'working',
    endsAt: g.expires_at.toISOString(),
  }))
  return { ok: true as const, key: keys[0] ?? null, keys }
}

/** Owner undo: put the layout back as it was when the decorator started; anything added goes to storage. */
export function undoLayout(userId: string, gigId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/undo-layout', { gigId }, async ({ client, characterId }) => {
    const g = await lockGig(client, gigId)
    if (!g || g.owner_id !== userId) return bad('That is not your job.', 404)
    if (!Array.isArray(g.snapshot)) return bad('There is nothing to undo yet.', 409)
    await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [characterId])
    const snap = g.snapshot as { id: string; x: number; z: number; rot: number; finish: string | null; stored: boolean }[]
    const known = new Set(snap.map((s) => s.id))
    for (const s of snap) {
      await client.query(`UPDATE home_placements SET x = $3, z = $4, rot = $5, finish = $6, stored = $7 WHERE id = $1 AND character_id = $2`, [s.id, characterId, s.x, s.z, s.rot, s.finish, s.stored])
    }
    const added = await client.query<{ id: string }>(`SELECT id FROM home_placements WHERE character_id = $1`, [characterId])
    const extra = added.rows.map((r) => r.id).filter((id) => !known.has(id))
    if (extra.length) await client.query(`UPDATE home_placements SET stored = TRUE WHERE id = ANY($1::text[])`, [extra])
    return good({ message: 'Your house is back how it was. Anything new went into storage.' })
  })
}

/** The player's own Gigs card: rank, rating, jobs, how owners rate them, and what the next rank needs. */
export async function myGigStats(userId: string) {
  const people = await loadPeople(pool, [userId])
  const me = people.get(userId)
  if (!me) return fail('Player not found.', 404)
  const open = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM gigs WHERE worker_id = $1 AND status IN ('hired','working','done','disputed')`, [userId])
  return { ok: true as const, me, working: open.rows[0]?.n ?? 0, next: nextRankFor(me.jobs, me.rating) }
}

import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { applyCash, asMoney, ensureGameState, getPublicState } from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { requireEconomySetup } from './economy.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import { RACE_COUNTDOWN_MS, RACE_MAX_RACERS, RACE_MAX_STAKE, racePrize } from './cars-rules.js'
import { getPlace } from './places.js'
import { openDirectChat, sendMessage } from './chat.js'

/*
 * Drag races, point to point. The host picks a finish (a place on the driving roads) and a stake.
 * Everyone who joins pays the stake to the server; the host starts it, all cars line up where the
 * host stood, and the first to reach the finish is paid the pot less the house cut. The server
 * holds the money the whole time: leaving before the start gives the stake back, leaving after
 * it does not, and a race nobody finishes is refunded.
 */

type RaceRow = {
  id: string
  host_character_id: string
  dest_place: string
  dest_label: string
  stake: string | number
  paid_in: number
  status: 'open' | 'running' | 'done' | 'cancelled'
  start_x: number
  start_z: number
  start_h: number
  dest_x: number
  dest_z: number
  starts_at: Date | null
  finished_at: Date | null
  winner_character_id: string | null
  prize: string | number | null
  created_at: Date
}

export type RaceView = {
  id: string
  dest: { id: string; label: string; x: number; z: number }
  stake: number
  status: RaceRow['status']
  start: { x: number; z: number; h: number }
  startsAt: number | null
  host: string
  racers: { name: string; slot: number; you: boolean; host: boolean }[]
  winner: string | null
  youWon: boolean
  prize: number | null
  mine: boolean
  youHost: boolean
  /** The host asked you by name. */
  invited: boolean
}

const fail = (error: string, code = 400, reason?: string) => ({ ok: false as const, error, code, reason })
const bad = (error: string, status = 400, reason?: string) => ({ status, body: { ok: false, error, reason } as Record<string, unknown> })
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

/** An open race nobody started, or a running one nobody finished, ends by itself after this long. */
const OPEN_MINUTES = 10
const RUN_MINUTES = 12
/** The fastest a car can go on these roads (game metres a second), for "did you really get there?". */
const TOP_SPEED = 23
/** How near the finish counts as there (game metres). */
const FINISH_REACH = 34

type Db = Pick<PoolClient, 'query'>

async function view(db: Db, rows: RaceRow[], characterId: string): Promise<RaceView[]> {
  if (rows.length === 0) return []
  const entries = await db.query<{ race_id: string; character_id: string; slot: number; username: string }>(
    `SELECT e.race_id, e.character_id, e.slot, u.username
     FROM car_race_entries e JOIN characters c ON c.id = e.character_id JOIN users u ON u.id = c.user_id
     WHERE e.race_id = ANY($1::text[]) ORDER BY e.slot`,
    [rows.map((r) => r.id)],
  )
  const names = await db.query<{ id: string; username: string }>(
    `SELECT c.id, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ANY($1::text[])`,
    [rows.flatMap((r) => [r.host_character_id, r.winner_character_id]).filter((id): id is string => Boolean(id))],
  )
  const nameOf = new Map(names.rows.map((n) => [n.id, n.username]))
  const asked = await db.query<{ race_id: string }>(`SELECT race_id FROM car_race_invites WHERE character_id = $1 AND race_id = ANY($2::text[])`, [characterId, rows.map((r) => r.id)])
  const invitedTo = new Set(asked.rows.map((r) => r.race_id))
  return rows.map((r) => {
    const mine = entries.rows.filter((e) => e.race_id === r.id)
    return {
      id: r.id,
      dest: { id: r.dest_place, label: r.dest_label, x: r.dest_x, z: r.dest_z },
      stake: asMoney(r.stake),
      status: r.status,
      start: { x: r.start_x, z: r.start_z, h: r.start_h },
      startsAt: r.starts_at ? r.starts_at.getTime() : null,
      host: nameOf.get(r.host_character_id) ?? 'someone',
      racers: mine.map((e) => ({ name: e.username, slot: e.slot, you: e.character_id === characterId, host: e.character_id === r.host_character_id })),
      winner: r.winner_character_id ? (nameOf.get(r.winner_character_id) ?? null) : null,
      youWon: r.winner_character_id === characterId,
      prize: r.prize == null ? null : asMoney(r.prize),
      mine: mine.some((e) => e.character_id === characterId),
      youHost: r.host_character_id === characterId,
      invited: invitedTo.has(r.id),
    }
  })
}

/** Give every racer of a race their stake back and close it. The race row must be locked. */
async function refundAll(client: PoolClient, race: RaceRow) {
  const stake = asMoney(race.stake)
  if (stake > 0) {
    const { rows } = await client.query<{ character_id: string }>(`SELECT character_id FROM car_race_entries WHERE race_id = $1 ORDER BY character_id`, [race.id])
    for (const row of rows) await applyCash(client, row.character_id, stake, 'Race called off: stake back', 'car_race')
  }
  await client.query(`UPDATE car_races SET status = 'cancelled', finished_at = NOW() WHERE id = $1`, [race.id])
}

/** Pay the pot to the winner and close the race. The race row must be locked. */
async function payWinner(client: PoolClient, race: RaceRow, winnerId: string) {
  // Everyone who lined up paid in, including those who gave up on the way
  const prize = racePrize(asMoney(race.stake), race.paid_in)
  if (prize > 0) await applyCash(client, winnerId, prize, `Race won: ${race.dest_label}`, 'car_race')
  await client.query(`UPDATE car_races SET status = 'done', finished_at = NOW(), winner_character_id = $2, prize = $3 WHERE id = $1`, [race.id, winnerId, prize])
  return prize
}

/** Close races left hanging: unstarted ones and ones nobody finished get their stakes back. */
async function sweep() {
  const stale = await pool.query<{ id: string }>(
    `SELECT id FROM car_races
     WHERE (status = 'open' AND created_at < NOW() - make_interval(mins => $1))
        OR (status = 'running' AND starts_at < NOW() - make_interval(mins => $2))
     LIMIT 20`,
    [OPEN_MINUTES, RUN_MINUTES],
  )
  for (const { id } of stale.rows) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<RaceRow>(`SELECT * FROM car_races WHERE id = $1 AND status IN ('open', 'running') FOR UPDATE`, [id])
      if (rows[0]) await refundAll(client, rows[0])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

/** Races you could join, and the one you are in (or just finished). */
export async function listRaces(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  await sweep()
  const me = gate.character.id
  const { rows } = await pool.query<RaceRow>(
    `SELECT r.* FROM car_races r
     WHERE r.status = 'open'
        OR (EXISTS (SELECT 1 FROM car_race_entries e WHERE e.race_id = r.id AND e.character_id = $1)
            AND (r.status = 'running' OR (r.status IN ('done', 'cancelled') AND r.finished_at > NOW() - INTERVAL '2 minutes')))
     ORDER BY r.created_at DESC LIMIT 30`,
    [me],
  )
  const all = await view(pool, rows, me)
  return {
    ok: true as const,
    now: Date.now(),
    mine: all.find((r) => r.mine && (r.status === 'open' || r.status === 'running')) ?? all.find((r) => r.mine) ?? null,
    // Races you were asked to come first
    open: all.filter((r) => r.status === 'open' && !r.mine).sort((a, b) => Number(b.invited) - Number(a.invited)),
  }
}

type Ctx = { client: PoolClient; characterId: string }

/** One race write that moves money: in a transaction, idempotent, one writer per character. */
async function writeRace(userId: string, idemKey: string, route: string, body: unknown, run: (ctx: Ctx) => Promise<{ status: number; body: Record<string, unknown> }>) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureGameState(client, gate.character.id, { cash: asMoney(gate.character.starting_cash ?? gate.character.cash), lodgingId: gate.character.lodging_id })
    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idemKey,
      route,
      body,
      run: async () => {
        const inSpace = await liveSpaceMoneyBlock([userId], client)
        if (inSpace) return bad(inSpace, 400, 'LIVE_SPACE')
        await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [gate.character.id])
        return run({ client, characterId: gate.character.id })
      },
    })
    await client.query('COMMIT')
    const out = result.body as Record<string, unknown>
    if (out.ok !== true) return fail((out.error as string) ?? 'Request failed.', result.status, out.reason as string | undefined)
    return done(userId, out)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Every race answer carries your money and the race list as they now stand. */
async function done(userId: string, out: Record<string, unknown>) {
  const [pub, races] = await Promise.all([getPublicState(userId), listRaces(userId)])
  if (!pub.ok) return pub
  if (!races.ok) return races
  return { ...out, ...races, state: { ok: true as const, ...pub.state } }
}

async function inARace(db: Db, characterId: string) {
  const { rows } = await db.query(
    `SELECT 1 FROM car_race_entries e JOIN car_races r ON r.id = e.race_id WHERE e.character_id = $1 AND r.status IN ('open', 'running') LIMIT 1`,
    [characterId],
  )
  return rows.length > 0
}

async function hasCar(db: Db, characterId: string) {
  const { rows } = await db.query(`SELECT 1 FROM car_holdings WHERE character_id = $1 AND active LIMIT 1`, [characterId])
  return rows.length > 0
}

export type NewRace = { destId: string; stake: number; x: number; z: number; h: number; destX: number; destZ: number }

/** Host a race from where you are to a place. You pay your own stake now. */
export function createRace(userId: string, input: NewRace, idemKey: string) {
  return writeRace(userId, idemKey, 'POST /cars/races', input, async ({ client, characterId }) => {
    const place = getPlace(input.destId)
    if (!place) return bad('Pick where the race ends.')
    if (!Number.isInteger(input.stake) || input.stake < 0 || input.stake > RACE_MAX_STAKE) return bad('That stake is too big.')
    if (Math.hypot(input.destX - input.x, input.destZ - input.z) < 150) return bad('Pick a finish further away.')
    if (!(await hasCar(client, characterId))) return bad('You need a car to race.', 400, 'NO_CAR')
    if (await inARace(client, characterId)) return bad('You are already in a race.', 400, 'IN_RACE')
    if (input.stake > 0) {
      const paid = await applyCash(client, characterId, -input.stake, `Race stake: ${place.label}`, 'car_race')
      if (!paid.ok) return bad(`You need ${naira(input.stake)} for the stake.`, 400, 'INSUFFICIENT_FUNDS')
    }
    const id = createId()
    await client.query(
      `INSERT INTO car_races (id, host_character_id, dest_place, dest_label, stake, start_x, start_z, start_h, dest_x, dest_z)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, characterId, place.id, place.label, input.stake, input.x, input.z, input.h, input.destX, input.destZ],
    )
    await client.query(`INSERT INTO car_race_entries (race_id, character_id, slot) VALUES ($1, $2, 0)`, [id, characterId])
    return { status: 200, body: { ok: true, message: `Race to ${place.label} is open.` } }
  })
}

/** Join an open race: you pay the same stake as everyone else. */
export function joinRace(userId: string, raceId: string, idemKey: string) {
  return writeRace(userId, idemKey, 'POST /cars/races/join', { raceId }, async ({ client, characterId }) => {
    const { rows } = await client.query<RaceRow>(`SELECT * FROM car_races WHERE id = $1 FOR UPDATE`, [raceId])
    const race = rows[0]
    if (!race || race.status !== 'open') return bad('That race has already started or ended.', 400, 'GONE')
    if (!(await hasCar(client, characterId))) return bad('You need a car to race.', 400, 'NO_CAR')
    if (await inARace(client, characterId)) return bad('You are already in a race.', 400, 'IN_RACE')
    const taken = await client.query<{ slot: number }>(`SELECT slot FROM car_race_entries WHERE race_id = $1`, [raceId])
    if (taken.rows.length >= RACE_MAX_RACERS) return bad('That race is full.', 400, 'FULL')
    const stake = asMoney(race.stake)
    if (stake > 0) {
      const paid = await applyCash(client, characterId, -stake, `Race stake: ${race.dest_label}`, 'car_race')
      if (!paid.ok) return bad(`You need ${naira(stake)} for the stake.`, 400, 'INSUFFICIENT_FUNDS')
    }
    const used = new Set(taken.rows.map((r) => r.slot))
    let slot = 0
    while (used.has(slot)) slot += 1
    await client.query(`INSERT INTO car_race_entries (race_id, character_id, slot) VALUES ($1, $2, $3)`, [raceId, characterId, slot])
    await client.query(`UPDATE car_races SET paid_in = paid_in + 1 WHERE id = $1`, [raceId])
    return { status: 200, body: { ok: true, message: `You are in. Race to ${race.dest_label}.` } }
  })
}

/** A race step that needs the race locked but no idempotency key (a second tap finds it already done). */
async function step(userId: string, raceId: string, run: (client: PoolClient, race: RaceRow, characterId: string) => Promise<{ error?: string; reason?: string; message?: string; extra?: Record<string, unknown> }>) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const client = await pool.connect()
  let out: Awaited<ReturnType<typeof run>>
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<RaceRow>(`SELECT * FROM car_races WHERE id = $1 FOR UPDATE`, [raceId])
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return fail('That race is gone.', 404, 'GONE')
    }
    out = await run(client, rows[0], gate.character.id)
    await client.query(out.error ? 'ROLLBACK' : 'COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  if (out.error) return fail(out.error, 400, out.reason)
  return done(userId, { ok: true as const, message: out.message ?? '', ...out.extra })
}

/** The host asks a player by name: the race shows as an invitation for them, and a message lands in their chat. */
export async function inviteToRace(userId: string, raceId: string, friendUserId: string) {
  if (friendUserId === userId) return fail('That is you.')
  const friend = await pool.query<{ id: string; username: string }>(`SELECT c.id, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.user_id = $1 LIMIT 1`, [friendUserId])
  const who = friend.rows[0]
  if (!who) return fail('That player was not found.', 404)
  const res = await step(userId, raceId, async (client, race, me) => {
    if (race.host_character_id !== me) return { error: 'Only the host can invite.' }
    if (race.status !== 'open') return { error: 'That race has already started or ended.', reason: 'GONE' }
    await client.query(`INSERT INTO car_race_invites (race_id, character_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [raceId, who.id])
    return { message: `Invited @${who.username}.`, extra: { dest: race.dest_label, stake: asMoney(race.stake) } }
  })
  if (res.ok) {
    // Best effort: the invitation itself is already saved
    try {
      const out = res as unknown as { dest: string; stake: number }
      const chat = await openDirectChat(userId, friendUserId)
      if (chat.ok) await sendMessage(userId, chat.chat.id, `🏁 Race me to ${out.dest}! ${out.stake > 0 ? `Stake: ${naira(out.stake)}.` : 'No stake.'} Get in your car, tap Race and join.`)
    } catch {
      /* the chat is a courtesy */
    }
  }
  return res
}

/** The host sends everyone to the line: the countdown starts for all racers at the same moment. */
export function startRace(userId: string, raceId: string) {
  return step(userId, raceId, async (client, race, me) => {
    if (race.host_character_id !== me) return { error: 'Only the host can start the race.' }
    if (race.status !== 'open') return { error: 'That race has already started or ended.', reason: 'GONE' }
    const { rows } = await client.query(`SELECT 1 FROM car_race_entries WHERE race_id = $1`, [raceId])
    if (rows.length < 2) return { error: 'Wait for someone to join first.', reason: 'ALONE' }
    await client.query(`UPDATE car_races SET status = 'running', starts_at = NOW() + make_interval(secs => $2) WHERE id = $1`, [raceId, RACE_COUNTDOWN_MS / 1000])
    return { message: 'Get ready!' }
  })
}

/** "I am at the finish": the first racer the server hears this from, and believes, takes the pot. */
export function finishRace(userId: string, raceId: string, x: number, z: number) {
  return step(userId, raceId, async (client, race, me) => {
    if (race.status === 'done') return { message: 'Race over.' }
    if (race.status !== 'running' || !race.starts_at) return { error: 'That race is not running.', reason: 'GONE' }
    const entry = await client.query(`SELECT 1 FROM car_race_entries WHERE race_id = $1 AND character_id = $2`, [raceId, me])
    if (!entry.rows[0]) return { error: 'You are not in that race.' }
    if (Math.hypot(race.dest_x - x, race.dest_z - z) > FINISH_REACH) return { error: 'You are not at the finish yet.', reason: 'NOT_THERE' }
    // Nobody covers the distance faster than a car at full speed in a straight line
    const least = (Math.hypot(race.dest_x - race.start_x, race.dest_z - race.start_z) / TOP_SPEED) * 1000 * 0.9
    if (Date.now() - race.starts_at.getTime() < least) return { error: 'Too fast to be true.', reason: 'TOO_FAST' }
    const prize = await payWinner(client, race, me)
    return { message: prize > 0 ? `You won ${naira(prize)}!` : 'You won!' }
  })
}

/**
 * Leave a race. Before the start you get your stake back (the host leaving calls the race off
 * for everyone). After the start your stake stays in the pot; the last racer left takes it.
 */
export function leaveRace(userId: string, raceId: string) {
  return step(userId, raceId, async (client, race, me) => {
    const entry = await client.query(`SELECT 1 FROM car_race_entries WHERE race_id = $1 AND character_id = $2`, [raceId, me])
    if (!entry.rows[0] || (race.status !== 'open' && race.status !== 'running')) return { message: 'You are out.' }
    const stake = asMoney(race.stake)
    if (race.status === 'open') {
      if (race.host_character_id === me) {
        await refundAll(client, race)
        return { message: 'Race called off.' }
      }
      if (stake > 0) await applyCash(client, me, stake, 'Left the race: stake back', 'car_race')
      await client.query(`DELETE FROM car_race_entries WHERE race_id = $1 AND character_id = $2`, [raceId, me])
      await client.query(`UPDATE car_races SET paid_in = paid_in - 1 WHERE id = $1`, [raceId])
      return { message: 'You left the race.' }
    }
    // Running: the stake is lost. One racer left standing wins without finishing.
    const others = await client.query<{ character_id: string }>(`SELECT character_id FROM car_race_entries WHERE race_id = $1 AND character_id <> $2`, [raceId, me])
    await client.query(`DELETE FROM car_race_entries WHERE race_id = $1 AND character_id = $2`, [raceId, me])
    if (others.rows.length === 1) await payWinner(client, race, others.rows[0]!.character_id)
    else if (others.rows.length === 0) await client.query(`UPDATE car_races SET status = 'cancelled', finished_at = NOW() WHERE id = $1`, [raceId])
    return { message: stake > 0 ? `You gave up the race and your ${naira(stake)} stake.` : 'You gave up the race.' }
  })
}

/** The race's live voice room: only its racers, while it is open or running. */
export async function raceVoiceAccess(userId: string, raceId: string) {
  const { rows } = await pool.query<{ status: string; username: string }>(
    `SELECT r.status, u.username FROM car_races r
       JOIN car_race_entries e ON e.race_id = r.id
       JOIN characters c ON c.id = e.character_id
       JOIN users u ON u.id = c.user_id
      WHERE r.id = $1 AND c.user_id = $2`,
    [raceId, userId],
  )
  const row = rows[0]
  if (!row) return fail('You are not in that race.', 403)
  if (row.status !== 'open' && row.status !== 'running') return fail('That race is over.', 400, 'GONE')
  return { ok: true as const, username: row.username }
}

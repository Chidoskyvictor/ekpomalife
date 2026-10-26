import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { postGameNotice } from './chat.js'
import { opponentAwaySeconds } from './game-live.js'
import { applyCash, asMoney, parseNeeds } from './game-state.js'
import { applyNeedDelta } from './needs.js'

/*
 * Phone → Games: online matches between two players (snooker first; more games plug into
 * GAMES). Challenge someone by username, or join quick match. Bets: any amount the wallet
 * can cover, taken from both players when the match is set up, paid to the winner.
 * Everyone gets the same number of bet matches per day; friendly games are unlimited.
 * Winning (any mode) gives Fun, a few times a day.
 */

export const GAMES: Record<string, { name: string; emoji: string; variants: string[] }> = {
  snooker: { name: 'Snooker', emoji: '🎱', variants: ['six', 'classic', 'clearance', 'black'] },
}

export const DAILY_BET_MATCHES = 10
export const DAILY_WIN_REWARDS = 5
const WIN_FUN = 12
const CHALLENGE_MINUTES = 10
const QUICK_MINUTES = 2
/** How long a player can be gone from a live match before the other can claim the win. */
export const FORFEIT_SECONDS = 60

type Fail = { ok: false; error: string; code: number }
const fail = (code: number, error: string): Fail => ({ ok: false, error, code })

type MatchRow = {
  id: string
  game: string
  variant: string
  kind: 'challenge' | 'quick'
  host_id: string
  guest_id: string | null
  stake: string
  status: string
  host_report: string | null
  guest_report: string | null
  winner_id: string | null
  created_at: Date
  expires_at: Date
  host_username: string
  guest_username: string | null
}

const MATCH_SELECT = `
  SELECT m.*, m.stake::text AS stake, hu.username AS host_username, gu.username AS guest_username
  FROM game_matches m
  JOIN characters hc ON hc.id = m.host_id JOIN users hu ON hu.id = hc.user_id
  LEFT JOIN characters gc ON gc.id = m.guest_id LEFT JOIN users gu ON gu.id = gc.user_id`

async function me(userId: string) {
  const found = await pool.query<{ id: string; username: string }>(
    `SELECT c.id, u.username FROM characters c JOIN users u ON u.id = c.user_id
     JOIN game_state g ON g.character_id = c.id WHERE c.user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
}

/** The match as one player sees it (player index 0 = host, 1 = guest). */
function view(row: MatchRow, characterId: string) {
  const isHost = row.host_id === characterId
  return {
    id: row.id,
    game: row.game,
    variant: row.variant,
    kind: row.kind,
    stake: asMoney(row.stake),
    status: row.status,
    myIndex: isHost ? 0 : 1,
    names: [`@${row.host_username}`, row.guest_username ? `@${row.guest_username}` : 'Waiting…'],
    opponent: isHost ? row.guest_username : row.host_username,
    incoming: !isHost && row.status === 'pending',
    won: row.winner_id ? row.winner_id === characterId : null,
    expiresAt: row.expires_at.toISOString(),
  }
}

/** Bet matches today (Lagos day) this player is in, counting ones still waiting. */
async function betMatchesToday(client: PoolClient | typeof pool, characterId: string) {
  const found = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM game_matches
     WHERE stake > 0 AND (host_id = $1 OR guest_id = $1)
       AND status IN ('pending', 'active', 'finished', 'disputed')
       AND (created_at AT TIME ZONE 'Africa/Lagos')::date = (NOW() AT TIME ZONE 'Africa/Lagos')::date`,
    [characterId],
  )
  return found.rows[0]?.n ?? 0
}

async function hold(client: PoolClient, characterId: string, stake: number, gameName: string) {
  if (stake <= 0) return true
  const paid = await applyCash(client, characterId, -stake, `${gameName} bet held`, 'bet_hold')
  return paid.ok
}

async function refund(client: PoolClient, characterId: string | null, stake: number, gameName: string) {
  if (stake <= 0 || !characterId) return
  await applyCash(client, characterId, stake, `${gameName} bet returned`, 'bet_refund')
}

async function inTx<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Waiting challenges / quick-match seats that ran out of time: close them, give stakes back. */
async function sweepExpired() {
  await inTx(async (client) => {
    const old = await client.query<{ id: string; host_id: string; stake: string; game: string }>(
      `SELECT id, host_id, stake::text AS stake, game FROM game_matches
       WHERE status = 'pending' AND expires_at < NOW() FOR UPDATE SKIP LOCKED`,
    )
    for (const m of old.rows) {
      await client.query(`UPDATE game_matches SET status = 'expired', finished_at = NOW() WHERE id = $1`, [m.id])
      await refund(client, m.host_id, asMoney(m.stake), GAMES[m.game]?.name ?? 'Game')
    }
  })
}

function readStake(raw: unknown) {
  const stake = Math.floor(Number(raw) || 0)
  return stake > 0 ? stake : 0
}

/** Challenge a player by username. */
export async function createChallenge(userId: string, input: { game: string; variant: string; username: string; stake: unknown }) {
  const game = GAMES[input.game]
  if (!game) return fail(404, 'No such game.')
  const variant = game.variants.includes(input.variant) ? input.variant : game.variants[0]!
  const stake = readStake(input.stake)
  const host = await me(userId)
  if (!host) return fail(409, 'Finish setting up your character first.')
  const target = await pool.query<{ id: string; user_id: string; username: string }>(
    `SELECT c.id, c.user_id, u.username FROM users u JOIN characters c ON c.user_id = u.id
     JOIN game_state g ON g.character_id = c.id
     WHERE LOWER(u.username) = LOWER($1)`,
    [input.username.replace(/^@/, '').trim()],
  )
  const guest = target.rows[0]
  if (!guest) return fail(404, `No player called @${input.username.replace(/^@/, '')}. Check the spelling.`)
  if (guest.id === host.id) return fail(400, "That's you. Challenge someone else.")
  if (stake > 0 && (await betMatchesToday(pool, host.id)) >= DAILY_BET_MATCHES) {
    return fail(429, `That's your ${DAILY_BET_MATCHES} bet matches for today. Friendly games are still on.`)
  }
  const result = await inTx(async (client) => {
    if (!(await hold(client, host.id, stake, game.name))) return fail(400, `You don't have ₦${stake.toLocaleString()} to bet.`)
    const id = createId()
    await client.query(
      `INSERT INTO game_matches (id, game, variant, kind, host_id, guest_id, stake, expires_at)
       VALUES ($1, $2, $3, 'challenge', $4, $5, $6, NOW() + make_interval(mins => $7))`,
      [id, input.game, variant, host.id, guest.id, stake, CHALLENGE_MINUTES],
    )
    return { ok: true as const, id }
  })
  if (!result.ok) return result
  await postGameNotice(userId, guest.user_id, JSON.stringify({ matchId: result.id, game: input.game, stake }))
  return getMatch(userId, result.id)
}

export async function getMatch(userId: string, matchId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const found = await pool.query<MatchRow>(`${MATCH_SELECT} WHERE m.id = $1`, [matchId])
  const row = found.rows[0]
  if (!row || (row.host_id !== player.id && row.guest_id !== player.id)) return fail(404, 'Match not found.')
  return { ok: true as const, match: view(row, player.id) }
}

/** Challenges waiting for you, ones you sent, and matches in progress. */
export async function listMatches(userId: string) {
  await sweepExpired()
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const found = await pool.query<MatchRow>(
    `${MATCH_SELECT} WHERE (m.host_id = $1 OR m.guest_id = $1) AND m.status IN ('pending', 'active')
     ORDER BY m.created_at DESC LIMIT 30`,
    [player.id],
  )
  return {
    ok: true as const,
    matches: found.rows.map((r) => view(r, player.id)),
    betMatchesLeft: Math.max(0, DAILY_BET_MATCHES - (await betMatchesToday(pool, player.id))),
  }
}

/** Accept a challenge: your stake is held too and the match goes live. */
export async function acceptChallenge(userId: string, matchId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const result = await inTx(async (client) => {
    const found = await client.query<{ guest_id: string | null; status: string; stake: string; game: string; expired: boolean }>(
      `SELECT guest_id, status, stake::text AS stake, game, expires_at < NOW() AS expired FROM game_matches WHERE id = $1 FOR UPDATE`,
      [matchId],
    )
    const m = found.rows[0]
    if (!m || m.guest_id !== player.id) return fail(404, 'Challenge not found.')
    if (m.status !== 'pending' || m.expired) return fail(409, 'This challenge has expired.')
    const stake = asMoney(m.stake)
    if (stake > 0 && (await betMatchesToday(client, player.id)) > DAILY_BET_MATCHES) {
      return fail(429, `That's your ${DAILY_BET_MATCHES} bet matches for today.`)
    }
    if (!(await hold(client, player.id, stake, GAMES[m.game]?.name ?? 'Game'))) {
      return fail(400, `You need ₦${stake.toLocaleString()} to accept this bet.`)
    }
    await client.query(`UPDATE game_matches SET status = 'active', accepted_at = NOW() WHERE id = $1`, [matchId])
    return { ok: true as const }
  })
  if (!result.ok) return result
  return getMatch(userId, matchId)
}

/** Guest says no, or host takes it back (also leaves a quick-match queue). Stake goes back. */
export async function closeChallenge(userId: string, matchId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  return inTx(async (client) => {
    const found = await client.query<{ host_id: string; guest_id: string | null; status: string; stake: string; game: string }>(
      `SELECT host_id, guest_id, status, stake::text AS stake, game FROM game_matches WHERE id = $1 FOR UPDATE`,
      [matchId],
    )
    const m = found.rows[0]
    if (!m || (m.host_id !== player.id && m.guest_id !== player.id)) return fail(404, 'Challenge not found.')
    if (m.status !== 'pending') return fail(409, 'This challenge already started or ended.')
    await client.query(`UPDATE game_matches SET status = $2, finished_at = NOW() WHERE id = $1`, [
      matchId,
      m.host_id === player.id ? 'cancelled' : 'declined',
    ])
    await refund(client, m.host_id, asMoney(m.stake), GAMES[m.game]?.name ?? 'Game')
    return { ok: true as const }
  })
}

/** Quick match: take a waiting seat with the same game, variant and stake, or wait for someone. */
export async function quickMatch(userId: string, input: { game: string; variant: string; stake: unknown }) {
  const game = GAMES[input.game]
  if (!game) return fail(404, 'No such game.')
  const variant = game.variants.includes(input.variant) ? input.variant : game.variants[0]!
  const stake = readStake(input.stake)
  await sweepExpired()
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  if (stake > 0 && (await betMatchesToday(pool, player.id)) >= DAILY_BET_MATCHES) {
    return fail(429, `That's your ${DAILY_BET_MATCHES} bet matches for today. Friendly games are still on.`)
  }
  const result = await inTx(async (client) => {
    const seat = await client.query<{ id: string }>(
      `SELECT id FROM game_matches
       WHERE kind = 'quick' AND status = 'pending' AND guest_id IS NULL AND host_id <> $1
         AND game = $2 AND variant = $3 AND stake = $4 AND expires_at > NOW()
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [player.id, input.game, variant, stake],
    )
    if (!(await hold(client, player.id, stake, game.name))) return fail(400, `You don't have ₦${stake.toLocaleString()} to bet.`)
    if (seat.rows[0]) {
      await client.query(
        `UPDATE game_matches SET guest_id = $2, status = 'active', accepted_at = NOW() WHERE id = $1`,
        [seat.rows[0].id, player.id],
      )
      return { ok: true as const, id: seat.rows[0].id }
    }
    const id = createId()
    await client.query(
      `INSERT INTO game_matches (id, game, variant, kind, host_id, stake, expires_at)
       VALUES ($1, $2, $3, 'quick', $4, $5, NOW() + make_interval(mins => $6))`,
      [id, input.game, variant, player.id, stake, QUICK_MINUTES],
    )
    return { ok: true as const, id }
  })
  if (!result.ok) return result
  return getMatch(userId, result.id)
}

/** Fun for a win, up to DAILY_WIN_REWARDS times a day. */
async function rewardWin(client: PoolClient, characterId: string) {
  const counted = await client.query<{ wins: number }>(
    `INSERT INTO game_rewards (character_id, day, wins) VALUES ($1, (NOW() AT TIME ZONE 'Africa/Lagos')::date, 1)
     ON CONFLICT (character_id, day) DO UPDATE SET wins = game_rewards.wins + 1
     RETURNING wins`,
    [characterId],
  )
  if ((counted.rows[0]?.wins ?? 99) > DAILY_WIN_REWARDS) return false
  const row = await client.query<{ needs: unknown }>(`SELECT needs FROM game_state WHERE character_id = $1 FOR UPDATE`, [characterId])
  const needs = applyNeedDelta(parseNeeds(row.rows[0]?.needs as never), { fun: WIN_FUN })
  await client.query(`UPDATE game_state SET needs = $2::jsonb, updated_at = NOW() WHERE character_id = $1`, [
    characterId,
    JSON.stringify(needs),
  ])
  return true
}

/** A win against the computer (vs the phone, no money involved): Fun only. */
export async function rewardCpuWin(userId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const rewarded = await inTx((client) => rewardWin(client, player.id))
  return { ok: true as const, rewarded, fun: rewarded ? WIN_FUN : 0 }
}

/**
 * Each phone reports who won. Same answer from both: pay the pot. Different answers: both
 * stakes go back. A player who's been gone longer than FORFEIT_SECONDS loses if the other claims it.
 */
export async function reportResult(userId: string, matchId: string, input: { winner: 'me' | 'opponent'; forfeit?: boolean }) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const outcome = await inTx(async (client) => {
    const found = await client.query<MatchRow>(`SELECT *, stake::text AS stake FROM game_matches WHERE id = $1 FOR UPDATE`, [matchId])
    const m = found.rows[0]
    if (!m || (m.host_id !== player.id && m.guest_id !== player.id)) return fail(404, 'Match not found.')
    if (m.status !== 'active') return { ok: true as const, status: m.status, winnerId: m.winner_id }
    const isHost = m.host_id === player.id
    const opponentId = (isHost ? m.guest_id : m.host_id)!
    const claimed = input.winner === 'me' ? player.id : opponentId
    await client.query(`UPDATE game_matches SET ${isHost ? 'host_report' : 'guest_report'} = $2 WHERE id = $1`, [matchId, claimed])
    const hostReport = isHost ? claimed : m.host_report
    const guestReport = isHost ? m.guest_report : claimed
    const gameName = GAMES[m.game]?.name ?? 'Game'
    const stake = asMoney(m.stake)

    let winnerId: string | null = null
    if (hostReport && guestReport) {
      if (hostReport !== guestReport) {
        await client.query(`UPDATE game_matches SET status = 'disputed', finished_at = NOW() WHERE id = $1`, [matchId])
        await refund(client, m.host_id, stake, gameName)
        await refund(client, m.guest_id, stake, gameName)
        return { ok: true as const, status: 'disputed', winnerId: null }
      }
      winnerId = hostReport
    } else if (input.forfeit && claimed === player.id && opponentAwaySeconds(matchId, opponentId) >= FORFEIT_SECONDS) {
      winnerId = player.id
    } else {
      return { ok: true as const, status: 'active', winnerId: null }
    }
    await client.query(`UPDATE game_matches SET status = 'finished', winner_id = $2, finished_at = NOW() WHERE id = $1`, [
      matchId,
      winnerId,
    ])
    if (stake > 0) await applyCash(client, winnerId, stake * 2, `${gameName} win`, 'bet_win')
    await rewardWin(client, winnerId)
    return { ok: true as const, status: 'finished', winnerId }
  })
  if (!outcome.ok) return outcome
  const match = await getMatch(userId, matchId)
  return match.ok ? { ...match, status: outcome.status } : match
}

/** For the live socket: is this player in this match, and as which seat? */
export async function seatInMatch(userId: string, matchId: string) {
  const found = await pool.query<{ character_id: string; username: string; seat: number; status: string }>(
    `SELECT c.id AS character_id, u.username,
            CASE WHEN m.host_id = c.id THEN 0 ELSE 1 END AS seat, m.status
     FROM game_matches m JOIN characters c ON c.user_id = $1 AND (m.host_id = c.id OR m.guest_id = c.id)
     JOIN users u ON u.id = c.user_id
     WHERE m.id = $2`,
    [userId, matchId],
  )
  return found.rows[0] ?? null
}

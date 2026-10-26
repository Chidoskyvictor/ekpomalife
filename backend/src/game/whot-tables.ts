import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { applyCash, asMoney } from './game-state.js'
import { liveSpaceMoneyBlock, liveSpaceMoneyBlockForCharacters } from './spaces-money.js'
import { applyNeedDelta } from './needs.js'
import { parseNeeds } from './game-state.js'
import { DAILY_BET_MATCHES, DAILY_WIN_REWARDS, WIN_FUN } from './games.js'
import { finishLiveTable, getLiveTable, startLiveTable } from './whot-live.js'

const GAME_NAME = 'Naija Whot!'
const LOBBY_MINUTES = 5
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

type Fail = { ok: false; error: string; code: number }
const fail = (code: number, error: string): Fail => ({ ok: false, error, code })

type PlayerRow = {
  character_id: string
  seat: number
  username: string
  stake_held: boolean
  forfeited: boolean
  left_at: Date | null
}

type TableRow = {
  id: string
  code: string
  host_id: string
  max_players: number
  stake: string
  status: string
  winner_id: string | null
  pot: string
  expires_at: Date
  started_at: Date | null
}

async function me(userId: string) {
  const found = await pool.query<{ id: string; username: string }>(
    `SELECT c.id, u.username FROM characters c JOIN users u ON u.id = c.user_id
     JOIN game_state g ON g.character_id = c.id WHERE c.user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
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

function makeCode() {
  let out = ''
  for (let i = 0; i < 6; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return out
}

async function betTablesToday(client: PoolClient | typeof pool, characterId: string) {
  const found = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM whot_table_players p
     JOIN whot_tables t ON t.id = p.table_id
     WHERE t.stake > 0 AND p.character_id = $1 AND p.stake_held
       AND t.status IN ('lobby', 'active', 'finished')
       AND (t.created_at AT TIME ZONE 'Africa/Lagos')::date = (NOW() AT TIME ZONE 'Africa/Lagos')::date`,
    [characterId],
  )
  return found.rows[0]?.n ?? 0
}

async function holdStake(client: PoolClient, characterId: string, stake: number) {
  if (stake <= 0) return true
  const paid = await applyCash(client, characterId, -stake, `${GAME_NAME} bet held`, 'bet_hold')
  return paid.ok
}

async function refundStake(client: PoolClient, characterId: string, stake: number) {
  if (stake <= 0) return
  await applyCash(client, characterId, stake, `${GAME_NAME} bet returned`, 'bet_refund')
}

export async function sweepExpiredWhotTables() {
  await inTx(async (client) => {
    const old = await client.query<{ id: string; stake: string }>(
      `SELECT id, stake::text AS stake FROM whot_tables
       WHERE status = 'lobby' AND expires_at < NOW() FOR UPDATE SKIP LOCKED`,
    )
    for (const t of old.rows) {
      const stake = asMoney(t.stake)
      const players = await client.query<{ character_id: string; stake_held: boolean }>(
        `SELECT character_id, stake_held FROM whot_table_players WHERE table_id = $1 AND left_at IS NULL`,
        [t.id],
      )
      for (const p of players.rows) {
        if (p.stake_held) await refundStake(client, p.character_id, stake)
      }
      await client.query(`UPDATE whot_tables SET status = 'expired', finished_at = NOW() WHERE id = $1`, [t.id])
    }
  })
}

function tableView(
  row: TableRow,
  players: PlayerRow[],
  characterId: string,
  betLeft: number,
): {
  id: string
  code: string
  hostId: string
  maxPlayers: number
  stake: number
  status: string
  pot: number
  expiresAt: string
  mySeat: number | null
  players: { seat: number; username: string; forfeited: boolean }[]
  isHost: boolean
  betMatchesLeft: number
} {
  const mine = players.find((p) => p.character_id === characterId && !p.left_at)
  return {
    id: row.id,
    code: row.code,
    hostId: row.host_id,
    maxPlayers: row.max_players,
    stake: asMoney(row.stake),
    status: row.status,
    pot: asMoney(row.pot),
    expiresAt: row.expires_at.toISOString(),
    mySeat: mine?.seat ?? null,
    players: players
      .filter((p) => !p.left_at)
      .map((p) => ({ seat: p.seat, username: p.username, forfeited: p.forfeited })),
    isHost: row.host_id === characterId,
    betMatchesLeft: betLeft,
  }
}

async function loadTable(tableId: string) {
  const t = await pool.query<TableRow>(
    `SELECT id, code, host_id, max_players, stake::text AS stake, status, winner_id, pot::text AS pot, expires_at, started_at
     FROM whot_tables WHERE id = $1`,
    [tableId],
  )
  const row = t.rows[0]
  if (!row) return null
  const players = await pool.query<PlayerRow>(
    `SELECT p.character_id, p.seat, p.stake_held, p.forfeited, p.left_at, u.username
     FROM whot_table_players p JOIN characters c ON c.id = p.character_id JOIN users u ON u.id = c.user_id
     WHERE p.table_id = $1 ORDER BY p.seat`,
    [tableId],
  )
  return { row, players: players.rows }
}

export async function createWhotTable(
  userId: string,
  input: { maxPlayers: number; stake: unknown },
) {
  await sweepExpiredWhotTables()
  const maxPlayers = Math.min(4, Math.max(2, Math.floor(Number(input.maxPlayers) || 2)))
  const stake = Math.max(0, Math.floor(Number(input.stake) || 0))
  const host = await me(userId)
  if (!host) return fail(409, 'Finish setting up your character first.')
  if (stake > 0 && (await betTablesToday(pool, host.id)) >= DAILY_BET_MATCHES) {
    return fail(429, `That's your ${DAILY_BET_MATCHES} bet tables for today. Friendly games are still on.`)
  }
  if (stake > 0) {
    const inSpace = await liveSpaceMoneyBlock([userId])
    if (inSpace) return fail(409, inSpace)
  }

  const result = await inTx(async (client) => {
    let code = makeCode()
    for (let i = 0; i < 8; i++) {
      const clash = await client.query(`SELECT 1 FROM whot_tables WHERE code = $1`, [code])
      if (!clash.rows[0]) break
      code = makeCode()
    }
    const id = createId()
    await client.query(
      `INSERT INTO whot_tables (id, code, host_id, max_players, stake, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(mins => $6))`,
      [id, code, host.id, maxPlayers, stake, LOBBY_MINUTES],
    )
    if (!(await holdStake(client, host.id, stake))) {
      return fail(400, `You don't have ₦${stake.toLocaleString()} to bet.`)
    }
    await client.query(
      `INSERT INTO whot_table_players (table_id, character_id, seat, stake_held) VALUES ($1, $2, 0, $3)`,
      [id, host.id, stake > 0],
    )
    return { ok: true as const, id }
  })
  if (!result.ok) return result
  return getWhotTable(userId, result.id)
}

export async function joinWhotTable(userId: string, code: string) {
  await sweepExpiredWhotTables()
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const normalized = code.replace(/\s/g, '').toUpperCase()
  const result = await inTx(async (client) => {
    const found = await client.query<TableRow>(
      `SELECT id, code, host_id, max_players, stake::text AS stake, status, winner_id, pot::text AS pot, expires_at, started_at
       FROM whot_tables WHERE code = $1 AND status = 'lobby' AND expires_at > NOW() FOR UPDATE`,
      [normalized],
    )
    const row = found.rows[0]
    if (!row) return fail(404, 'No open table with that code.')
    const stake = asMoney(row.stake)
    if (stake > 0 && (await betTablesToday(client, player.id)) >= DAILY_BET_MATCHES) {
      return fail(429, `That's your ${DAILY_BET_MATCHES} bet tables for today.`)
    }
    if (stake > 0) {
      const inSpace = await liveSpaceMoneyBlock([userId], client)
      if (inSpace) return fail(409, inSpace)
    }
    const seated = await client.query<{ seat: number }>(
      `SELECT seat FROM whot_table_players WHERE table_id = $1 AND character_id = $2 AND left_at IS NULL`,
      [row.id, player.id],
    )
    if (seated.rows[0]) return { ok: true as const, id: row.id }

    const count = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM whot_table_players WHERE table_id = $1 AND left_at IS NULL`,
      [row.id],
    )
    if ((count.rows[0]?.n ?? 0) >= row.max_players) return fail(409, 'This table is full.')
    const taken = await client.query<{ seat: number }>(
      `SELECT seat FROM whot_table_players WHERE table_id = $1 AND left_at IS NULL ORDER BY seat`,
      [row.id],
    )
    const used = new Set(taken.rows.map((r) => r.seat))
    let seat = 0
    while (used.has(seat) && seat < row.max_players) seat++
    if (!(await holdStake(client, player.id, stake))) {
      return fail(400, `You need ₦${stake.toLocaleString()} to join this bet.`)
    }
    await client.query(
      `INSERT INTO whot_table_players (table_id, character_id, seat, stake_held) VALUES ($1, $2, $3, $4)`,
      [row.id, player.id, seat, stake > 0],
    )
    const n = (count.rows[0]?.n ?? 0) + 1
    await client.query(`UPDATE whot_tables SET pot = $2 WHERE id = $1`, [row.id, stake * n])
    return { ok: true as const, id: row.id }
  })
  if (!result.ok) return result
  return getWhotTable(userId, result.id)
}

export async function leaveWhotTable(userId: string, tableId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  return inTx(async (client) => {
    const found = await client.query<TableRow>(
      `SELECT id, host_id, stake::text AS stake, status, max_players, code, winner_id, pot::text AS pot, expires_at, started_at
       FROM whot_tables WHERE id = $1 FOR UPDATE`,
      [tableId],
    )
    const row = found.rows[0]
    if (!row) return fail(404, 'Table not found.')
    if (row.status !== 'lobby') return fail(409, 'The game already started.')
    const stake = asMoney(row.stake)
    const member = await client.query<{ stake_held: boolean }>(
      `SELECT stake_held FROM whot_table_players WHERE table_id = $1 AND character_id = $2 AND left_at IS NULL`,
      [tableId, player.id],
    )
    if (!member.rows[0]) return fail(404, 'You are not at this table.')
    if (member.rows[0].stake_held) await refundStake(client, player.id, stake)
    await client.query(
      `UPDATE whot_table_players SET left_at = NOW(), stake_held = FALSE WHERE table_id = $1 AND character_id = $2`,
      [tableId, player.id],
    )
    const left = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM whot_table_players WHERE table_id = $1 AND left_at IS NULL`,
      [tableId],
    )
    const n = left.rows[0]?.n ?? 0
    if (n === 0) {
      await client.query(`UPDATE whot_tables SET status = 'cancelled', finished_at = NOW(), pot = 0 WHERE id = $1`, [tableId])
    } else {
      if (row.host_id === player.id) {
        const next = await client.query<{ character_id: string }>(
          `SELECT character_id FROM whot_table_players WHERE table_id = $1 AND left_at IS NULL ORDER BY seat LIMIT 1`,
          [tableId],
        )
        if (next.rows[0]) await client.query(`UPDATE whot_tables SET host_id = $2, pot = $3 WHERE id = $1`, [
          tableId,
          next.rows[0].character_id,
          stake * n,
        ])
      } else {
        await client.query(`UPDATE whot_tables SET pot = $2 WHERE id = $1`, [tableId, stake * n])
      }
    }
    return { ok: true as const }
  })
}

export async function startWhotTable(userId: string, tableId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const started = await inTx(async (client) => {
    const found = await client.query<TableRow>(
      `SELECT id, host_id, stake::text AS stake, status, max_players, code, winner_id, pot::text AS pot, expires_at, started_at
       FROM whot_tables WHERE id = $1 FOR UPDATE`,
      [tableId],
    )
    const row = found.rows[0]
    if (!row) return fail(404, 'Table not found.')
    if (row.host_id !== player.id) return fail(403, 'Only the host can start.')
    if (row.status !== 'lobby') return fail(409, 'This table already started.')
    if (row.expires_at < new Date()) return fail(409, 'This table expired.')
    const players = await client.query<PlayerRow>(
      `SELECT p.character_id, p.seat, p.stake_held, p.forfeited, p.left_at, u.username
       FROM whot_table_players p JOIN characters c ON c.id = p.character_id JOIN users u ON u.id = c.user_id
       WHERE p.table_id = $1 AND p.left_at IS NULL ORDER BY p.seat`,
      [tableId],
    )
    if (players.rows.length < 2) return fail(400, 'Need at least two players.')
    const stake = asMoney(row.stake)
    const pot = stake * players.rows.length
    await client.query(
      `UPDATE whot_tables SET status = 'active', started_at = NOW(), pot = $2, expires_at = NOW() + interval '2 hours' WHERE id = $1`,
      [tableId, pot],
    )
    return {
      ok: true as const,
      seats: players.rows.map((p) => ({
        characterId: p.character_id,
        seat: p.seat,
        name: `@${p.username}`,
      })),
      pot,
    }
  })
  if (!started.ok) return started
  startLiveTable(tableId, started.seats, started.pot)
  return getWhotTable(userId, tableId)
}

export async function getWhotTable(userId: string, tableId: string) {
  await sweepExpiredWhotTables()
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const loaded = await loadTable(tableId)
  if (!loaded) return fail(404, 'Table not found.')
  const member = loaded.players.some((p) => p.character_id === player.id && !p.left_at)
  if (!member) return fail(404, 'Table not found.')
  const betLeft = Math.max(0, DAILY_BET_MATCHES - (await betTablesToday(pool, player.id)))
  return { ok: true as const, table: tableView(loaded.row, loaded.players, player.id, betLeft) }
}

export async function seatInWhotTable(userId: string, tableId: string) {
  const player = await me(userId)
  if (!player) return null
  const found = await pool.query<{ seat: number; status: string }>(
    `SELECT p.seat, t.status FROM whot_table_players p
     JOIN whot_tables t ON t.id = p.table_id
     WHERE t.id = $1 AND p.character_id = $2 AND p.left_at IS NULL`,
    [tableId, player.id],
  )
  const row = found.rows[0]
  if (!row || row.status !== 'active') return null
  return { characterId: player.id, seat: row.seat }
}

export async function recordWhotForfeit(tableId: string, characterId: string) {
  await pool.query(`UPDATE whot_table_players SET forfeited = TRUE WHERE table_id = $1 AND character_id = $2`, [
    tableId,
    characterId,
  ])
}

export async function finishWhotTable(tableId: string, winnerCharacterId: string) {
  await inTx(async (client) => {
    const found = await client.query<{ stake: string; pot: string; status: string }>(
      `SELECT stake::text AS stake, pot::text AS pot, status FROM whot_tables WHERE id = $1 FOR UPDATE`,
      [tableId],
    )
    const row = found.rows[0]
    if (!row || row.status !== 'active') return
    const pot = asMoney(row.pot)
    await client.query(
      `UPDATE whot_tables SET status = 'finished', winner_id = $2, finished_at = NOW() WHERE id = $1`,
      [tableId, winnerCharacterId],
    )
    if (pot > 0) {
      // Anyone at the table in a live Space: no pot changes hands — every held stake goes back
      const seated = await client.query<{ character_id: string }>(
        `SELECT character_id FROM whot_table_players WHERE table_id = $1 AND stake_held`,
        [tableId],
      )
      const ids = seated.rows.map((r) => r.character_id)
      if (await liveSpaceMoneyBlockForCharacters([winnerCharacterId, ...ids], client)) {
        for (const id of ids) await refundStake(client, id, asMoney(row.stake))
      } else {
        await applyCash(client, winnerCharacterId, pot, `${GAME_NAME} win`, 'bet_win')
      }
    }
    await client.query(`UPDATE game_state SET whot_wins = whot_wins + 1, updated_at = NOW() WHERE character_id = $1`, [
      winnerCharacterId,
    ])
    const counted = await client.query<{ wins: number }>(
      `INSERT INTO game_rewards (character_id, day, wins) VALUES ($1, (NOW() AT TIME ZONE 'Africa/Lagos')::date, 1)
       ON CONFLICT (character_id, day) DO UPDATE SET wins = game_rewards.wins + 1
       RETURNING wins`,
      [winnerCharacterId],
    )
    if ((counted.rows[0]?.wins ?? 99) <= DAILY_WIN_REWARDS) {
      const gs = await client.query<{ needs: unknown }>(`SELECT needs FROM game_state WHERE character_id = $1 FOR UPDATE`, [
        winnerCharacterId,
      ])
      const needs = applyNeedDelta(parseNeeds(gs.rows[0]?.needs as never), { fun: WIN_FUN })
      await client.query(`UPDATE game_state SET needs = $2::jsonb, updated_at = NOW() WHERE character_id = $1`, [
        winnerCharacterId,
        JSON.stringify(needs),
      ])
    }
  })
  finishLiveTable(tableId)
}

export async function rewardWhotCpuWin(userId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  await inTx(async (client) => {
    await client.query(`UPDATE game_state SET whot_wins = whot_wins + 1, updated_at = NOW() WHERE character_id = $1`, [
      player.id,
    ])
    const counted = await client.query<{ wins: number }>(
      `INSERT INTO game_rewards (character_id, day, wins) VALUES ($1, (NOW() AT TIME ZONE 'Africa/Lagos')::date, 1)
       ON CONFLICT (character_id, day) DO UPDATE SET wins = game_rewards.wins + 1
       RETURNING wins`,
      [player.id],
    )
    if ((counted.rows[0]?.wins ?? 99) <= DAILY_WIN_REWARDS) {
      const gs = await client.query<{ needs: unknown }>(`SELECT needs FROM game_state WHERE character_id = $1 FOR UPDATE`, [
        player.id,
      ])
      const needs = applyNeedDelta(parseNeeds(gs.rows[0]?.needs as never), { fun: WIN_FUN })
      await client.query(`UPDATE game_state SET needs = $2::jsonb, updated_at = NOW() WHERE character_id = $1`, [
        player.id,
        JSON.stringify(needs),
      ])
    }
  })
  const counted = await pool.query<{ wins: number }>(
    `SELECT wins FROM game_rewards WHERE character_id = $1 AND day = (NOW() AT TIME ZONE 'Africa/Lagos')::date`,
    [player.id],
  )
  const wins = counted.rows[0]?.wins ?? 0
  const rewarded = wins <= DAILY_WIN_REWARDS
  return { ok: true as const, rewarded, fun: rewarded ? WIN_FUN : 0 }
}

export function whotTableLive(tableId: string) {
  return getLiveTable(tableId)
}

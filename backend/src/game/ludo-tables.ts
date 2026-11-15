import { randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { WebSocket } from 'ws'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { applyCash, asMoney } from './game-state.js'
import { DAILY_BET_MATCHES, rewardWin } from './games.js'
import { act, dropLudoRoom, ludoView, openLudoRoom, setSeatAway } from './ludo-live.js'
import { liveSpaceMoneyBlock, liveSpaceMoneyBlockForCharacters } from './spaces-money.js'

/*
 * Ludo tables: 2–4 players, join with a code, host starts once at least two are seated (a full
 * table is not required). Everyone puts in the same stake; the winner takes the pot. Like 1v1
 * matches the server rolls the dice, checks every move and decides the winner (ludo-live.ts).
 * A player who leaves or drops out has their turns played for them, quickly, so the rest can finish.
 */

const GAME_NAME = 'Ludo'
const LOBBY_MINUTES = 5
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

type Fail = { ok: false; error: string; code: number }
const fail = (code: number, error: string): Fail => ({ ok: false, error, code })

type PlayerRow = { character_id: string; seat: number; stake_held: boolean; left_at: Date | null; username: string }
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
}

const TABLE_COLS = `id, code, host_id, max_players, stake::text AS stake, status, winner_id, pot::text AS pot, expires_at`

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
    `SELECT COUNT(*)::int AS n FROM ludo_table_players p
     JOIN ludo_tables t ON t.id = p.table_id
     WHERE t.stake > 0 AND p.character_id = $1 AND p.stake_held
       AND t.status IN ('lobby', 'active', 'finished')
       AND (t.created_at AT TIME ZONE 'Africa/Lagos')::date = (NOW() AT TIME ZONE 'Africa/Lagos')::date`,
    [characterId],
  )
  return found.rows[0]?.n ?? 0
}

async function holdStake(client: PoolClient, characterId: string, stake: number) {
  if (stake <= 0) return true
  return (await applyCash(client, characterId, -stake, `${GAME_NAME} bet held`, 'bet_hold')).ok
}

async function refundStake(client: PoolClient, characterId: string, stake: number) {
  if (stake > 0) await applyCash(client, characterId, stake, `${GAME_NAME} bet returned`, 'bet_refund')
}

export async function sweepExpiredLudoTables() {
  await inTx(async (client) => {
    const old = await client.query<{ id: string; stake: string }>(
      `SELECT id, stake::text AS stake FROM ludo_tables WHERE status = 'lobby' AND expires_at < NOW() FOR UPDATE SKIP LOCKED`,
    )
    for (const t of old.rows) {
      const players = await client.query<{ character_id: string; stake_held: boolean }>(
        `SELECT character_id, stake_held FROM ludo_table_players WHERE table_id = $1 AND left_at IS NULL`,
        [t.id],
      )
      for (const p of players.rows) if (p.stake_held) await refundStake(client, p.character_id, asMoney(t.stake))
      await client.query(`UPDATE ludo_tables SET status = 'expired', finished_at = NOW() WHERE id = $1`, [t.id])
    }
  })
}

async function loadTable(tableId: string) {
  const t = await pool.query<TableRow>(`SELECT ${TABLE_COLS} FROM ludo_tables WHERE id = $1`, [tableId])
  const row = t.rows[0]
  if (!row) return null
  const players = await pool.query<PlayerRow>(
    `SELECT p.character_id, p.seat, p.stake_held, p.left_at, u.username
     FROM ludo_table_players p JOIN characters c ON c.id = p.character_id JOIN users u ON u.id = c.user_id
     WHERE p.table_id = $1 ORDER BY p.seat`,
    [tableId],
  )
  return { row, players: players.rows }
}

/** Same shape the Whot lobby uses, so the phone lobby UI is shared. */
function tableView(row: TableRow, players: PlayerRow[], characterId: string, betLeft: number) {
  const here = players.filter((p) => !p.left_at)
  const mine = here.find((p) => p.character_id === characterId)
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
    players: here.map((p) => ({ seat: p.seat, username: p.username, forfeited: false })),
    isHost: row.host_id === characterId,
    betMatchesLeft: betLeft,
  }
}

export async function getLudoTable(userId: string, tableId: string) {
  await sweepExpiredLudoTables()
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const loaded = await loadTable(tableId)
  if (!loaded) return fail(404, 'Table not found.')
  if (!loaded.players.some((p) => p.character_id === player.id && !p.left_at)) return fail(404, 'Table not found.')
  const betLeft = Math.max(0, DAILY_BET_MATCHES - (await betTablesToday(pool, player.id)))
  return { ok: true as const, table: tableView(loaded.row, loaded.players, player.id, betLeft) }
}

export async function createLudoTable(userId: string, input: { maxPlayers: number; stake: unknown }) {
  await sweepExpiredLudoTables()
  const maxPlayers = Math.min(4, Math.max(2, Math.floor(Number(input.maxPlayers) || 4)))
  const stake = Math.max(0, Math.floor(Number(input.stake) || 0))
  const host = await me(userId)
  if (!host) return fail(409, 'Finish setting up your character first.')
  if (stake > 0 && (await betTablesToday(pool, host.id)) >= DAILY_BET_MATCHES) {
    return fail(429, `That's your ${DAILY_BET_MATCHES} bet games for today. Friendly games are still on.`)
  }
  if (stake > 0) {
    const inSpace = await liveSpaceMoneyBlock([userId])
    if (inSpace) return fail(409, inSpace)
  }
  const result = await inTx(async (client) => {
    let code = makeCode()
    for (let i = 0; i < 8; i++) {
      if (!(await client.query(`SELECT 1 FROM ludo_tables WHERE code = $1`, [code])).rows[0]) break
      code = makeCode()
    }
    const id = createId()
    if (!(await holdStake(client, host.id, stake))) return fail(400, `You don't have ₦${stake.toLocaleString()} to bet.`)
    await client.query(
      `INSERT INTO ludo_tables (id, code, host_id, max_players, stake, pot, expires_at)
       VALUES ($1, $2, $3, $4, $5, $5, NOW() + make_interval(mins => $6))`,
      [id, code, host.id, maxPlayers, stake, LOBBY_MINUTES],
    )
    await client.query(`INSERT INTO ludo_table_players (table_id, character_id, seat, stake_held) VALUES ($1, $2, 0, $3)`, [
      id,
      host.id,
      stake > 0,
    ])
    return { ok: true as const, id }
  })
  if (!result.ok) return result
  return getLudoTable(userId, result.id)
}

export async function joinLudoTable(userId: string, code: string) {
  await sweepExpiredLudoTables()
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const normalized = code.replace(/\s/g, '').toUpperCase()
  const result = await inTx(async (client) => {
    const found = await client.query<TableRow>(
      `SELECT ${TABLE_COLS} FROM ludo_tables WHERE code = $1 AND status = 'lobby' AND expires_at > NOW() FOR UPDATE`,
      [normalized],
    )
    const row = found.rows[0]
    if (!row) return fail(404, 'No open table with that code.')
    const stake = asMoney(row.stake)
    const seated = await client.query(`SELECT 1 FROM ludo_table_players WHERE table_id = $1 AND character_id = $2 AND left_at IS NULL`, [row.id, player.id])
    if (seated.rows[0]) return { ok: true as const, id: row.id }
    if (stake > 0 && (await betTablesToday(client, player.id)) >= DAILY_BET_MATCHES) {
      return fail(429, `That's your ${DAILY_BET_MATCHES} bet games for today.`)
    }
    if (stake > 0) {
      const inSpace = await liveSpaceMoneyBlock([userId], client)
      if (inSpace) return fail(409, inSpace)
    }
    const taken = await client.query<{ seat: number }>(`SELECT seat FROM ludo_table_players WHERE table_id = $1 AND left_at IS NULL ORDER BY seat`, [row.id])
    if (taken.rows.length >= row.max_players) return fail(409, 'This table is full.')
    const used = new Set(taken.rows.map((r) => r.seat))
    let seat = 0
    while (used.has(seat)) seat++
    if (!(await holdStake(client, player.id, stake))) return fail(400, `You need ₦${stake.toLocaleString()} to join this bet.`)
    // A player who left earlier may come back to their old row
    await client.query(
      `INSERT INTO ludo_table_players (table_id, character_id, seat, stake_held) VALUES ($1, $2, $3, $4)
       ON CONFLICT (table_id, character_id) DO UPDATE SET seat = $3, stake_held = $4, left_at = NULL`,
      [row.id, player.id, seat, stake > 0],
    )
    await client.query(`UPDATE ludo_tables SET pot = $2 WHERE id = $1`, [row.id, stake * (taken.rows.length + 1)])
    return { ok: true as const, id: row.id }
  })
  if (!result.ok) return result
  return getLudoTable(userId, result.id)
}

export async function leaveLudoTable(userId: string, tableId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  return inTx(async (client) => {
    const found = await client.query<TableRow>(`SELECT ${TABLE_COLS} FROM ludo_tables WHERE id = $1 FOR UPDATE`, [tableId])
    const row = found.rows[0]
    if (!row) return fail(404, 'Table not found.')
    if (row.status !== 'lobby') return fail(409, 'The game already started.')
    const stake = asMoney(row.stake)
    const member = await client.query<{ stake_held: boolean }>(
      `SELECT stake_held FROM ludo_table_players WHERE table_id = $1 AND character_id = $2 AND left_at IS NULL`,
      [tableId, player.id],
    )
    if (!member.rows[0]) return fail(404, 'You are not at this table.')
    if (member.rows[0].stake_held) await refundStake(client, player.id, stake)
    await client.query(`UPDATE ludo_table_players SET left_at = NOW(), stake_held = FALSE WHERE table_id = $1 AND character_id = $2`, [tableId, player.id])
    const rest = await client.query<{ character_id: string }>(
      `SELECT character_id FROM ludo_table_players WHERE table_id = $1 AND left_at IS NULL ORDER BY seat`,
      [tableId],
    )
    if (rest.rows.length === 0) {
      await client.query(`UPDATE ludo_tables SET status = 'cancelled', finished_at = NOW(), pot = 0 WHERE id = $1`, [tableId])
    } else {
      const newHost = row.host_id === player.id ? rest.rows[0]!.character_id : row.host_id
      await client.query(`UPDATE ludo_tables SET host_id = $2, pot = $3 WHERE id = $1`, [tableId, newHost, stake * rest.rows.length])
    }
    return { ok: true as const }
  })
}

/* —— live tables: who sits where, sockets —— */

type Live = { characters: string[]; names: string[]; pot: number; stake: number; sockets: Map<number, WebSocket> }
const live = new Map<string, Live>()
const tickets = new Map<string, { tableId: string; seat: number; expires: number }>()

function send(socket: WebSocket | null | undefined, msg: unknown) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
}

export async function startLudoTable(userId: string, tableId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const started = await inTx(async (client) => {
    const found = await client.query<TableRow>(`SELECT ${TABLE_COLS} FROM ludo_tables WHERE id = $1 FOR UPDATE`, [tableId])
    const row = found.rows[0]
    if (!row) return fail(404, 'Table not found.')
    if (row.host_id !== player.id) return fail(403, 'Only the host can start.')
    if (row.status !== 'lobby') return fail(409, 'This table already started.')
    if (row.expires_at < new Date()) return fail(409, 'This table expired.')
    const players = await client.query<PlayerRow>(
      `SELECT p.character_id, p.seat, p.stake_held, p.left_at, u.username
       FROM ludo_table_players p JOIN characters c ON c.id = p.character_id JOIN users u ON u.id = c.user_id
       WHERE p.table_id = $1 AND p.left_at IS NULL ORDER BY p.seat`,
      [tableId],
    )
    if (players.rows.length < 2) return fail(400, 'Need at least two players.')
    const pot = asMoney(row.stake) * players.rows.length
    await client.query(
      `UPDATE ludo_tables SET status = 'active', started_at = NOW(), pot = $2, expires_at = NOW() + interval '2 hours' WHERE id = $1`,
      [tableId, pot],
    )
    return { ok: true as const, players: players.rows, pot, stake: asMoney(row.stake) }
  })
  if (!started.ok) return started
  const entry: Live = {
    characters: started.players.map((p) => p.character_id),
    names: started.players.map((p) => `@${p.username}`),
    pot: started.pot,
    stake: started.stake,
    sockets: new Map(),
  }
  live.set(tableId, entry)
  openLudoRoom(tableId, entry.characters.length, {
    broadcast: (msg) => {
      for (const s of entry.sockets.values()) send(s, msg)
    },
    finish: (winnerSeat) => {
      void finishLudoTable(tableId, entry.characters[winnerSeat]!).catch((e) => console.error('ludo table settle failed', e))
    },
  })
  // Everyone counts as away until their phone connects, so a player who never shows up doesn't hold the game
  entry.characters.forEach((_, seat) => setSeatAway(tableId, seat, true))
  return getLudoTable(userId, tableId)
}

export async function ludoTableTicket(userId: string, tableId: string) {
  const player = await me(userId)
  const entry = live.get(tableId)
  if (!player || !entry) return null
  const seat = entry.characters.indexOf(player.id)
  if (seat < 0) return null
  const token = randomBytes(24).toString('base64url')
  const now = Date.now()
  for (const [k, t] of tickets) if (t.expires < now) tickets.delete(k)
  tickets.set(token, { tableId, seat, expires: now + 60_000 })
  return { ticket: token, seat }
}

async function finishLudoTable(tableId: string, winnerCharacterId: string) {
  await inTx(async (client) => {
    const found = await client.query<{ stake: string; pot: string; status: string }>(
      `SELECT stake::text AS stake, pot::text AS pot, status FROM ludo_tables WHERE id = $1 FOR UPDATE`,
      [tableId],
    )
    const row = found.rows[0]
    if (!row || row.status !== 'active') return
    await client.query(`UPDATE ludo_tables SET status = 'finished', winner_id = $2, finished_at = NOW() WHERE id = $1`, [tableId, winnerCharacterId])
    const pot = asMoney(row.pot)
    if (pot > 0) {
      const seated = await client.query<{ character_id: string }>(`SELECT character_id FROM ludo_table_players WHERE table_id = $1 AND stake_held`, [tableId])
      const ids = seated.rows.map((r) => r.character_id)
      if (await liveSpaceMoneyBlockForCharacters([winnerCharacterId, ...ids], client)) {
        for (const id of ids) await refundStake(client, id, asMoney(row.stake))
      } else {
        await applyCash(client, winnerCharacterId, pot, `${GAME_NAME} win`, 'bet_win')
      }
    }
    await rewardWin(client, winnerCharacterId)
  })
  // Keep the room a while so phones can still read the final board, then forget it
  setTimeout(() => {
    live.delete(tableId)
    dropLudoRoom(tableId)
  }, 10 * 60_000).unref?.()
}

export function joinLudoTableSocket(socket: WebSocket, token: string | undefined) {
  const ticket = token ? tickets.get(token) : undefined
  if (!ticket || ticket.expires < Date.now()) {
    send(socket, { t: 'error', error: 'Ticket expired. Reconnecting…' })
    socket.close(4001, 'bad ticket')
    return
  }
  tickets.delete(token!)
  const entry = live.get(ticket.tableId)
  if (!entry) {
    send(socket, { t: 'error', error: 'Table not live.' })
    socket.close(4002, 'no table')
    return
  }
  const old = entry.sockets.get(ticket.seat)
  if (old && old !== socket) old.close(4003, 'replaced')
  entry.sockets.set(ticket.seat, socket)
  setSeatAway(ticket.tableId, ticket.seat, false)
  send(socket, { t: 'table', seat: ticket.seat, names: entry.names, pot: entry.pot, stake: entry.stake })
  send(socket, ludoView(ticket.tableId))

  socket.on('message', (data) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(data)) as Record<string, unknown>
    } catch {
      return
    }
    if (msg.t !== 'roll' && msg.t !== 'move') return
    const out = act(ticket.tableId, ticket.seat, msg)
    if (!out.ok) send(socket, { t: 'error', error: out.error })
  })

  socket.on('close', () => {
    if (entry.sockets.get(ticket.seat) !== socket) return
    entry.sockets.delete(ticket.seat)
    setSeatAway(ticket.tableId, ticket.seat, true)
  })
}

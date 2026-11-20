import { pool } from '../db.js'
import {
  checkClock,
  declineDraw,
  offerDraw,
  markJoined,
  nextDeadline,
  newChessState,
  playMove,
  resign,
  snapshotOf,
  type ChessOutcome,
  type ChessState,
} from './chess-rules.js'

/*
 * Live chess matches: state kept in memory and saved on the match row, so a server restart
 * doesn't lose a game or its clocks. The server is the referee: it validates each move,
 * runs both clocks and settles the stake itself (reportResult from the phones is ignored).
 */

export const CHESS_MESSAGES = new Set(['move', 'resign', 'sync', 'draw', 'decline'])

type Live = { state: ChessState; timer: ReturnType<typeof setTimeout> | null; saving: Promise<unknown> }
/** Sends to a seat's socket (the relay in game-live.ts supplies this). */
export type ChessEmit = (seat: 0 | 1 | 'both', message: Record<string, unknown>) => void

const live = new Map<string, Live>()
const emitters = new Map<string, ChessEmit>()

async function load(matchId: string): Promise<Live | null> {
  const known = live.get(matchId)
  if (known) return known
  const found = await pool.query<{ game: string; status: string; state: ChessState | null }>(
    `SELECT game, status, state FROM game_matches WHERE id = $1`,
    [matchId],
  )
  const row = found.rows[0]
  if (!row || row.game !== 'chess' || row.status !== 'active') return null
  const raced = live.get(matchId)
  if (raced) return raced
  const entry: Live = { state: row.state ?? newChessState(Date.now()), timer: null, saving: Promise.resolve() }
  live.set(matchId, entry)
  if (!row.state) await save(matchId, entry)
  return entry
}

function save(matchId: string, entry: Live) {
  entry.saving = entry.saving.then(() =>
    pool.query(`UPDATE game_matches SET state = $2::jsonb WHERE id = $1`, [matchId, JSON.stringify(entry.state)]),
  )
  return entry.saving
}

async function finish(matchId: string, entry: Live, outcome: ChessOutcome) {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  await save(matchId, entry)
  // Loaded here, not at the top: games.ts imports game-live.ts, which imports this file
  const { settleServerDecided } = await import('./games.js')
  await settleServerDecided(matchId, outcome.winner)
  emitters.get(matchId)?.('both', { t: 'chess', ...snapshotOf(entry.state, Date.now()) })
  // Keep it around a little for late reconnects, then forget
  setTimeout(() => live.delete(matchId), 10 * 60_000).unref?.()
}

function schedule(matchId: string, entry: Live) {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  const at = nextDeadline(entry.state)
  if (at == null) return
  entry.timer = setTimeout(
    () => {
      const outcome = checkClock(entry.state, Date.now())
      if (outcome) void finish(matchId, entry, outcome).catch(() => {})
      else schedule(matchId, entry)
    },
    Math.min(2_000_000_000, Math.max(50, at - Date.now() + 25)),
  )
  entry.timer.unref?.()
}

/** A player's socket joined: seat them, start the clock when both are here, send the board. */
export async function chessJoin(matchId: string, seat: 0 | 1, emit: ChessEmit) {
  const entry = await load(matchId)
  if (!entry) return
  emitters.set(matchId, emit)
  const wasJoined = entry.state.joined[seat]
  const before = entry.state.since
  markJoined(entry.state, seat, Date.now())
  const outcome = checkClock(entry.state, Date.now())
  if (outcome) return void (await finish(matchId, entry, outcome))
  if (entry.state.since !== before || !wasJoined) await save(matchId, entry)
  schedule(matchId, entry)
  emit('both', { t: 'chess', ...snapshotOf(entry.state, Date.now()) })
}

/** move / resign / sync from a player's socket. */
export async function chessMessage(matchId: string, seat: 0 | 1, msg: Record<string, unknown>, emit: ChessEmit) {
  const entry = await load(matchId)
  if (!entry) return
  emitters.set(matchId, emit)
  const now = Date.now()
  if (msg.t === 'sync') return emit(seat, { t: 'chess', ...snapshotOf(entry.state, now) })
  if (msg.t === 'resign') {
    const outcome = resign(entry.state, seat)
    return void (outcome && (await finish(matchId, entry, outcome)))
  }
  if (msg.t === 'draw' || msg.t === 'decline') {
    if (msg.t === 'decline') declineDraw(entry.state, seat)
    else {
      const outcome = offerDraw(entry.state, seat)
      if (outcome) return void (await finish(matchId, entry, outcome))
    }
    await save(matchId, entry)
    return emit('both', { t: 'chess', ...snapshotOf(entry.state, now) })
  }
  if (msg.t !== 'move') return
  const result = playMove(
    entry.state,
    seat,
    { from: String(msg.from ?? ''), to: String(msg.to ?? ''), promotion: msg.promotion ? String(msg.promotion) : undefined },
    now,
  )
  if (!result.ok) {
    emit(seat, { t: 'chess-error', error: result.error })
    // Out-of-sync phone: give it the true board
    return emit(seat, { t: 'chess', ...snapshotOf(entry.state, now) })
  }
  if (result.over) return void (await finish(matchId, entry, result.over))
  await save(matchId, entry)
  schedule(matchId, entry)
  emit('both', { t: 'chess', ...snapshotOf(entry.state, now), san: result.san })
}

/** After a restart: pick up chess matches that were running, so their clocks keep going. */
export async function resumeChessMatches() {
  const found = await pool.query<{ id: string }>(`SELECT id FROM game_matches WHERE game = 'chess' AND status = 'active'`)
  for (const row of found.rows) {
    const entry = await load(row.id)
    if (!entry) continue
    const outcome = checkClock(entry.state, Date.now())
    if (outcome) await finish(row.id, entry, outcome)
    else schedule(row.id, entry)
  }
}

/** The current board for a spectator who just sat down to watch. */
export async function chessSnapshot(matchId: string) {
  const entry = await load(matchId)
  return entry ? snapshotOf(entry.state, Date.now()) : null
}

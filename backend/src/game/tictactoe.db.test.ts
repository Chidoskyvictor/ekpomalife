import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Real database: OFF unless TTT_DB_TESTS=1 (use the dev Neon branch only). Plays staked
 * Tic tac toe matches through the real match system and relay with fake sockets, and checks that
 * the server's board, not the phones' reports, decides who is paid.
 */
const run = process.env.TTT_DB_TESTS === '1' ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let games: typeof import('./games.js')
let live: typeof import('./game-live.js')

beforeAll(async () => {
  if (process.env.TTT_DB_TESTS !== '1') return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  games = await import('./games.js')
  live = await import('./game-live.js')
})
afterAll(async () => {
  if (process.env.TTT_DB_TESTS !== '1') return
  await pool.query(`DELETE FROM game_matches WHERE host_id IN (SELECT id FROM characters WHERE user_id = ANY($1))`, [users])
  for (const id of users) await fixtures.cleanupTestUser(id)
})

function fakeSocket() {
  const handlers: Record<string, (data?: unknown) => void> = {}
  const sent: Record<string, unknown>[] = []
  const socket = {
    OPEN: 1,
    readyState: 1,
    send: (s: string) => sent.push(JSON.parse(s)),
    close: () => {},
    on: (ev: string, fn: (data?: unknown) => void) => (handlers[ev] = fn),
  }
  return { socket: socket as never, sent, say: (m: unknown) => handlers.message!(JSON.stringify(m)) }
}

async function cash(userId: string) {
  const r = await pool.query<{ cash: string }>(`SELECT g.cash::text FROM game_state g JOIN characters c ON c.id = g.character_id WHERE c.user_id = $1`, [userId])
  return Number(r.rows[0]!.cash)
}

async function startMatch(stake: number) {
  const a = await fixtures.createTestUser({ cash: 1000 })
  const b = await fixtures.createTestUser({ cash: 1000 })
  users.push(a.userId, b.userId)
  const [ua, ub] = await Promise.all(
    [a, b].map(async (u) => (await pool.query<{ username: string }>('SELECT username FROM users WHERE id = $1', [u.userId])).rows[0]!.username),
  )
  const made = await games.createChallenge(a.userId, { game: 'tictactoe', variant: 'standard', username: ub!, stake })
  if (!made.ok) throw new Error(made.error)
  const acc = await games.acceptChallenge(b.userId, made.match.id)
  if (!acc.ok) throw new Error(acc.error)
  const id = made.match.id
  const seatA = (await games.seatInMatch(a.userId, id))!
  const seatB = (await games.seatInMatch(b.userId, id))!
  const sa = fakeSocket()
  const sb = fakeSocket()
  live.joinGame(sa.socket, live.createGameTicket(id, seatA.character_id, seatA.seat, seatA.game))
  live.joinGame(sb.socket, live.createGameTicket(id, seatB.character_id, seatB.seat, seatB.game))
  void ua
  return { a, b, id, sa, sb }
}

run('staked tic tac toe is judged by the server (database)', () => {
  it('pays the player who really wins, even if the loser reports a win', async () => {
    const { a, b, id, sa, sb } = await startMatch(100)
    expect(await cash(a.userId)).toBe(900)
    expect(await cash(b.userId)).toBe(900)
    // A bogus claim before any win is ignored
    const early = await games.reportResult(b.userId, id, { winner: 'me' })
    expect(early).toMatchObject({ ok: true, status: 'active' })
    // Out of turn / taken squares are refused
    sb.say({ t: 'move', cell: 4 })
    expect(sb.sent.at(-1)).toMatchObject({ t: 'ttt', error: 'Not your turn.' })
    // X (host, seat 0) takes the top row
    sa.say({ t: 'move', cell: 0 })
    sb.say({ t: 'move', cell: 3 })
    sa.say({ t: 'move', cell: 1 })
    sb.say({ t: 'move', cell: 4 })
    sa.say({ t: 'move', cell: 2 })
    expect(sb.sent.at(-1)).toMatchObject({ t: 'ttt', winnerSeat: 0, line: [0, 1, 2] })
    // The loser claims they won; the board says otherwise
    const lie = await games.reportResult(b.userId, id, { winner: 'me' })
    expect(lie).toMatchObject({ ok: true, status: 'finished' })
    expect(await cash(a.userId)).toBe(1100)
    expect(await cash(b.userId)).toBe(900)
    const again = await games.reportResult(a.userId, id, { winner: 'me' })
    expect(again).toMatchObject({ ok: true, status: 'finished' })
    expect(await cash(a.userId)).toBe(1100)
  }, 90_000)

  it('pays the guest (O) when the guest reports first, and the stake is not paid twice', async () => {
    const { a, b, id, sa, sb } = await startMatch(100)
    // O (guest, seat 1) wins down the middle column
    sa.say({ t: 'move', cell: 0 })
    sb.say({ t: 'move', cell: 1 })
    sa.say({ t: 'move', cell: 3 })
    sb.say({ t: 'move', cell: 4 })
    sa.say({ t: 'move', cell: 8 })
    sb.say({ t: 'move', cell: 7 })
    expect(sa.sent.at(-1)).toMatchObject({ winnerSeat: 1, line: [1, 4, 7] })
    const win = await games.reportResult(b.userId, id, { winner: 'opponent' })
    expect(win).toMatchObject({ ok: true, status: 'finished' })
    expect(await cash(b.userId)).toBe(1100)
    expect(await cash(a.userId)).toBe(900)
    await games.reportResult(a.userId, id, { winner: 'me' })
    expect(await cash(b.userId)).toBe(1100)
  }, 90_000)

  it('pays out by itself when the board is decided, before any phone reports', async () => {
    const { a, b, id, sa, sb } = await startMatch(100)
    for (const [who, cell] of [[sa, 0], [sb, 3], [sa, 1], [sb, 4], [sa, 2]] as const) who.say({ t: 'move', cell })
    for (let i = 0; i < 30 && (await cash(a.userId)) !== 1100; i++) await new Promise((r) => setTimeout(r, 1000))
    expect(await cash(a.userId)).toBe(1100)
    expect(await cash(b.userId)).toBe(900)
    expect(await games.reportResult(b.userId, id, { winner: 'me' })).toMatchObject({ status: 'finished' })
    expect(await cash(a.userId)).toBe(1100)
  }, 90_000)

  it('cannot be won by forfeit while the opponent is still at the table', async () => {
    const { b, id } = await startMatch(0)
    const res = await games.reportResult(b.userId, id, { winner: 'me', forfeit: true })
    expect(res).toMatchObject({ ok: true, status: 'active' })
  }, 90_000)
})

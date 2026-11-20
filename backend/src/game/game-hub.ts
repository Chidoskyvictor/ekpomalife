import { pool } from '../db.js'
import { createId } from '../ids.js'
import { postGameNotice } from './chat.js'
import { applyCash, asMoney } from './game-state.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import { watcherCount } from './game-live.js'
import {
  DAILY_BET_MATCHES,
  GAMES,
  betMatchesToday,
  fail,
  hold,
  inTx,
  me,
  readStake,
  sweepExpired,
} from './games.js'

/*
 * Games hub: hosted tables + live matches to watch.
 *
 * A hosted table is a `game_matches` row (kind 'hosted', status 'pending', no guest yet). The host's
 * stake is taken from their wallet when the table is posted (a 'bet_hold' ledger row) and sits in
 * escrow on that row. When someone sits, their stake is held the same way in one transaction on the
 * locked row (so two people can never take the same seat) and the row becomes an ordinary active
 * match: the existing engine (live sockets, server referee, payout to the winner, results log) takes
 * over. If nobody sits before it expires, the expiry sweep refunds the host. There is no house cut:
 * the winner takes the whole pot.
 *
 * Plug-in point for rebuilt games: a game is hostable if it is in GAMES (games.ts) and is played on
 * the match engine. Games with their own table engine (Whot, multi-seat Ludo tables) join by adding
 * a start adapter here; they report results through recordGameResult (game-results.ts).
 */

export const HOSTABLE_GAMES = ['snooker', 'chess', 'tictactoe', 'ludo'] as const
const TABLE_HOURS = 6
const MAX_OPEN_TABLES = 3
const NOTE_MAX = 40

const FACE = `u.username, pp.display_name, pp.avatar_color, c.appearance`

type FaceRow = { username: string; display_name: string | null; avatar_color: string | null; appearance: unknown }
const face = (r: FaceRow) => ({
  username: r.username,
  displayName: r.display_name ?? r.username,
  avatarColor: r.avatar_color ?? '#3d9ad6',
  appearance: r.appearance ?? null,
})

type TableRow = FaceRow & {
  id: string
  game: string
  variant: string
  stake: string
  rules: { note?: string } | null
  expires_at: Date
  host_id: string
}

function tableView(r: TableRow, myId: string) {
  const stake = asMoney(r.stake)
  return {
    id: r.id,
    game: r.game,
    variant: r.variant,
    stake,
    pot: stake * 2,
    note: r.rules?.note ?? '',
    host: face(r),
    expiresAt: r.expires_at.toISOString(),
    mine: r.host_id === myId,
  }
}

/** Post a table. Your stake is held now; you can leave the game. */
export async function hostTable(userId: string, input: { game: string; variant?: string; stake: unknown; note?: string }) {
  const game = GAMES[input.game]
  if (!game || !(HOSTABLE_GAMES as readonly string[]).includes(input.game)) return fail(404, 'You can’t host that game yet.')
  const variant = game.variants.includes(input.variant ?? '') ? input.variant! : game.variants[0]!
  const stake = readStake(input.stake)
  const note = (input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)
  const host = await me(userId)
  if (!host) return fail(409, 'Finish setting up your character first.')
  if (stake > 0 && (await betMatchesToday(pool, host.id)) >= DAILY_BET_MATCHES) {
    return fail(429, `That's your ${DAILY_BET_MATCHES} bet matches for today. Friendly tables are still on.`)
  }
  if (stake > 0) {
    const inSpace = await liveSpaceMoneyBlock([userId])
    if (inSpace) return fail(409, inSpace)
  }
  const id = createId()
  const made = await inTx(async (client) => {
    // Lock this player's wallet row first: it serialises their table posting so the cap can't be raced
    await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [host.id])
    const open = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM game_matches WHERE kind = 'hosted' AND status = 'pending' AND host_id = $1 AND expires_at > NOW()`,
      [host.id],
    )
    if ((open.rows[0]?.n ?? 0) >= MAX_OPEN_TABLES) return fail(409, `You already have ${MAX_OPEN_TABLES} tables open. Cancel one first.`)
    if (stake > 0) {
      const paid = await applyCash(client, host.id, -stake, `${game.name} table stake held`, 'bet_hold')
      if (!paid.ok) return fail(400, `You don't have ₦${stake.toLocaleString()} to put up.`)
    }
    await client.query(
      `INSERT INTO game_matches (id, game, variant, kind, host_id, stake, rules, expires_at)
       VALUES ($1, $2, $3, 'hosted', $4, $5, $6::jsonb, NOW() + make_interval(hours => $7))`,
      [id, input.game, variant, host.id, stake, JSON.stringify(note ? { note } : {}), TABLE_HOURS],
    )
    return { ok: true as const }
  })
  if (!made.ok) return made
  return { ok: true as const, id }
}

/** Tables waiting for a second player (everyone's). Also refunds ones that ran out. */
export async function listTables(userId: string, game?: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  await sweepExpired()
  const found = await pool.query<TableRow>(
    `SELECT m.id, m.game, m.variant, m.stake::text AS stake, m.rules, m.expires_at, m.host_id, ${FACE}
     FROM game_matches m JOIN characters c ON c.id = m.host_id JOIN users u ON u.id = c.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE m.kind = 'hosted' AND m.status = 'pending' AND m.expires_at > NOW() AND ($1::text IS NULL OR m.game = $1)
     ORDER BY (m.host_id = $2) DESC, m.created_at DESC LIMIT 60`,
    [game ?? null, player.id],
  )
  return {
    ok: true as const,
    tables: found.rows.map((r) => tableView(r, player.id)),
    betMatchesLeft: Math.max(0, DAILY_BET_MATCHES - (await betMatchesToday(pool, player.id))),
  }
}

/** Sit at a table: your stake is held, the match starts, the host is told. */
export async function sitAtTable(userId: string, tableId: string) {
  const player = await me(userId)
  if (!player) return fail(409, 'Finish setting up your character first.')
  const peek = await pool.query<{ host_id: string; stake: string }>(
    `SELECT host_id, stake::text AS stake FROM game_matches WHERE id = $1 AND kind = 'hosted'`,
    [tableId],
  )
  const row = peek.rows[0]
  if (!row) return fail(404, 'That table is gone.')
  if (row.host_id === player.id) return fail(400, 'That’s your own table. Wait for someone to sit.')
  if (asMoney(row.stake) > 0) {
    if ((await betMatchesToday(pool, player.id)) >= DAILY_BET_MATCHES) {
      return fail(429, `That's your ${DAILY_BET_MATCHES} bet matches for today. Friendly tables are still on.`)
    }
    const inSpace = await liveSpaceMoneyBlock([userId])
    if (inSpace) return fail(409, inSpace)
  }
  const seated = await inTx(async (client) => {
    const found = await client.query<{ host_id: string; stake: string; game: string; status: string; expired: boolean }>(
      `SELECT host_id, stake::text AS stake, game, status, expires_at < NOW() AS expired
       FROM game_matches WHERE id = $1 AND kind = 'hosted' FOR UPDATE`,
      [tableId],
    )
    const m = found.rows[0]
    if (!m || m.status !== 'pending' || m.expired) return fail(409, 'Someone just took that seat.')
    const stake = asMoney(m.stake)
    if (!(await hold(client, player.id, stake, GAMES[m.game]?.name ?? 'Game'))) {
      return fail(400, `You need ₦${stake.toLocaleString()} to sit here.`)
    }
    await client.query(`UPDATE game_matches SET guest_id = $2, status = 'active', accepted_at = NOW() WHERE id = $1`, [tableId, player.id])
    return { ok: true as const, hostId: m.host_id, game: m.game, stake }
  })
  if (!seated.ok) return seated
  const hostUser = await pool.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [seated.hostId])
  if (hostUser.rows[0]) {
    await postGameNotice(
      userId,
      hostUser.rows[0].user_id,
      JSON.stringify({ matchId: tableId, game: seated.game, stake: seated.stake, sat: true }),
    ).catch(() => {})
  }
  return { ok: true as const, matchId: tableId }
}

type LiveRow = {
  id: string
  game: string
  variant: string
  stake: string
  accepted_at: Date | null
  hu: string
  hdn: string | null
  hcolor: string | null
  happ: unknown
  gu: string
  gdn: string | null
  gcolor: string | null
  gapp: unknown
}

/** Matches in progress right now, for the Watch tab (biggest pots first). */
export async function liveMatches() {
  const found = await pool.query<LiveRow>(
    `SELECT m.id, m.game, m.variant, m.stake::text AS stake, m.accepted_at,
            hu.username AS hu, hp.display_name AS hdn, hp.avatar_color AS hcolor, hc.appearance AS happ,
            gu.username AS gu, gp.display_name AS gdn, gp.avatar_color AS gcolor, gc.appearance AS gapp
     FROM game_matches m
     JOIN characters hc ON hc.id = m.host_id JOIN users hu ON hu.id = hc.user_id LEFT JOIN player_profiles hp ON hp.user_id = hu.id
     JOIN characters gc ON gc.id = m.guest_id JOIN users gu ON gu.id = gc.user_id LEFT JOIN player_profiles gp ON gp.user_id = gu.id
     WHERE m.status = 'active' AND m.accepted_at > NOW() - INTERVAL '3 hours'
     ORDER BY m.stake DESC, m.accepted_at DESC LIMIT 40`,
  )
  return {
    ok: true as const,
    matches: found.rows.map((r) => ({
      id: r.id,
      game: r.game,
      variant: r.variant,
      stake: asMoney(r.stake),
      pot: asMoney(r.stake) * 2,
      startedAt: r.accepted_at?.toISOString() ?? null,
      watching: watcherCount(r.id),
      players: [
        face({ username: r.hu, display_name: r.hdn, avatar_color: r.hcolor, appearance: r.happ }),
        face({ username: r.gu, display_name: r.gdn, avatar_color: r.gcolor, appearance: r.gapp }),
      ],
    })),
  }
}

/** A live match anyone may watch (read-only), or null. */
export async function watchableMatch(matchId: string) {
  const found = await pool.query<{ id: string; game: string; variant: string; stake: string; status: string; hu: string; gu: string | null }>(
    `SELECT m.id, m.game, m.variant, m.stake::text AS stake, m.status, hu.username AS hu, gu.username AS gu
     FROM game_matches m JOIN characters hc ON hc.id = m.host_id JOIN users hu ON hu.id = hc.user_id
     LEFT JOIN characters gc ON gc.id = m.guest_id LEFT JOIN users gu ON gu.id = gc.user_id WHERE m.id = $1`,
    [matchId],
  )
  const m = found.rows[0]
  if (!m || m.status !== 'active' || !m.gu) return null
  return { id: m.id, game: m.game, variant: m.variant, stake: asMoney(m.stake), names: [`@${m.hu}`, `@${m.gu}`] as [string, string] }
}

/** Per-game numbers for the Games tab cards: players in a match now, open tables, players this week. */
export async function hubSummary() {
  const [now, week, whot, ludo] = await Promise.all([
    pool.query<{ game: string; playing: number; tables: number }>(
      `SELECT game, (COUNT(*) FILTER (WHERE status = 'active') * 2)::int AS playing,
              COUNT(*) FILTER (WHERE kind = 'hosted' AND status = 'pending' AND expires_at > NOW())::int AS tables
       FROM game_matches WHERE status IN ('active', 'pending') GROUP BY game`,
    ),
    pool.query<{ game: string; players: number }>(
      `SELECT game, COUNT(DISTINCT player_id)::int AS players FROM game_results
       WHERE played_at >= (date_trunc('week', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos') GROUP BY game`,
    ),
    pool.query<{ playing: number; tables: number }>(
      `SELECT (SELECT COUNT(*) FROM whot_table_players p JOIN whot_tables t ON t.id = p.table_id WHERE t.status = 'active' AND p.left_at IS NULL)::int AS playing,
              (SELECT COUNT(*) FROM whot_tables WHERE status = 'lobby' AND expires_at > NOW())::int AS tables`,
    ),
    pool.query<{ playing: number; tables: number }>(
      `SELECT (SELECT COUNT(*) FROM ludo_table_players p JOIN ludo_tables t ON t.id = p.table_id WHERE t.status = 'active' AND p.left_at IS NULL)::int AS playing,
              (SELECT COUNT(*) FROM ludo_tables WHERE status = 'lobby' AND expires_at > NOW())::int AS tables`,
    ),
  ])
  const out: Record<string, { playing: number; tables: number; players: number }> = {}
  for (const id of Object.keys(GAMES)) out[id] = { playing: 0, tables: 0, players: 0 }
  for (const r of now.rows) if (out[r.game]) Object.assign(out[r.game]!, { playing: r.playing, tables: r.tables })
  for (const r of week.rows) if (out[r.game]) out[r.game]!.players = r.players
  out.whot!.playing += whot.rows[0]?.playing ?? 0
  out.whot!.tables += whot.rows[0]?.tables ?? 0
  out.ludo!.playing += ludo.rows[0]?.playing ?? 0
  out.ludo!.tables += ludo.rows[0]?.tables ?? 0
  return { ok: true as const, games: out }
}

import type { PoolClient } from 'pg'
import { pool } from '../db.js'

/*
 * Results log behind Top Charts and head-to-head records.
 *
 * Plug-in interface for any game (Whot, Ludo, 8-ball pool, ... as they are rebuilt):
 *   recordGameResult(client, { matchId, game, stake, players, winnerId })
 * Call it inside the same transaction that pays the pot. It is idempotent per match, so a retried
 * settlement can't double count. `winnerId: null` records a draw. `stake` is each player's stake
 * (0 for friendly games); a winner's net gain from each opponent is that opponent's stake.
 */

export const CHART_MIN_GAMES = 5
/** Wins over the same opponent that count on one Lagos day; extra wins still show in head-to-head. */
export const CHART_MAX_WINS_PER_OPPONENT_DAY = 3
export const CHART_SIZE = 50

export type RecordInput = { matchId: string; game: string; stake: number; players: string[]; winnerId: string | null }

export async function recordGameResult(client: PoolClient, input: RecordInput) {
  const { matchId, game, stake, players, winnerId } = input
  const ids = [...new Set(players)]
  const rows: { player: string; opp: string; outcome: 'win' | 'loss' | 'draw'; net: number }[] = []
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue
      if (winnerId == null) rows.push({ player: a, opp: b, outcome: 'draw', net: 0 })
      else if (a === winnerId) rows.push({ player: a, opp: b, outcome: 'win', net: stake })
      else if (b === winnerId) rows.push({ player: a, opp: b, outcome: 'loss', net: -stake })
    }
  }
  for (const r of rows) {
    await client.query(
      `INSERT INTO game_results (match_id, player_id, opponent_id, game, outcome, net, stake)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [matchId, r.player, r.opp, game, r.outcome, r.net, stake],
    )
  }
}

type Period = 'week' | 'all'
const PERIOD_START = {
  // Monday 00:00 Lagos time
  week: `(date_trunc('week', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`,
  all: `'-infinity'::timestamptz`,
} as const

type ChartRow = {
  rank: string
  player_id: string
  games: number
  wins: number
  won: string
  username: string
  display_name: string | null
  avatar_color: string | null
  appearance: unknown
}

export type ChartEntry = {
  rank: number
  username: string
  displayName: string
  avatarColor: string
  appearance: unknown
  games: number
  wins: number
  winRate: number
  won: number
  me: boolean
}

/** Per-game leaderboard: wins vs real players (tiebreak money won), min 5 games, counted-win cap per opponent per day. */
export async function topChart(userId: string, game: string, period: Period) {
  const me = await pool.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [userId])
  const myId = me.rows[0]?.id ?? null
  const found = await pool.query<ChartRow>(
    `WITH base AS (
       SELECT r.*, CASE WHEN r.outcome = 'win' THEN
                ROW_NUMBER() OVER (PARTITION BY r.player_id, r.opponent_id, r.outcome,
                                   (r.played_at AT TIME ZONE 'Africa/Lagos')::date ORDER BY r.played_at) END AS rn
       FROM game_results r WHERE r.game = $1 AND r.played_at >= ${PERIOD_START[period]}
     ), agg AS (
       SELECT player_id, COUNT(DISTINCT match_id)::int AS games,
              COUNT(*) FILTER (WHERE outcome = 'win' AND rn <= $2)::int AS wins,
              COALESCE(SUM(net) FILTER (WHERE outcome = 'win' AND rn <= $2), 0)::text AS won
       FROM base GROUP BY player_id HAVING COUNT(DISTINCT match_id) >= $3
     ), ranked AS (
       SELECT agg.*, ROW_NUMBER() OVER (ORDER BY wins DESC, won::bigint DESC, games ASC, player_id) AS rank FROM agg
     )
     SELECT ranked.rank::text, ranked.player_id, ranked.games, ranked.wins, ranked.won,
            u.username, pp.display_name, pp.avatar_color, c.appearance
     FROM ranked JOIN characters c ON c.id = ranked.player_id JOIN users u ON u.id = c.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE ranked.rank <= $4 OR ranked.player_id = $5
     ORDER BY ranked.rank`,
    [game, CHART_MAX_WINS_PER_OPPONENT_DAY, CHART_MIN_GAMES, CHART_SIZE, myId],
  )
  const entries: ChartEntry[] = found.rows.map((r) => ({
    rank: Number(r.rank),
    username: r.username,
    displayName: r.display_name ?? r.username,
    avatarColor: r.avatar_color ?? '#3d9ad6',
    appearance: r.appearance ?? null,
    games: r.games,
    wins: r.wins,
    winRate: r.games ? Math.round((r.wins / r.games) * 100) : 0,
    won: Number(r.won),
    me: r.player_id === myId,
  }))
  const mine = entries.find((e) => e.me) ?? null
  let gamesPlayed = mine?.games ?? 0
  if (!mine && myId) {
    const n = await pool.query<{ n: number }>(
      `SELECT COUNT(DISTINCT match_id)::int AS n FROM game_results
       WHERE game = $1 AND player_id = $2 AND played_at >= ${PERIOD_START[period]}`,
      [game, myId],
    )
    gamesPlayed = n.rows[0]?.n ?? 0
  }
  return {
    ok: true as const,
    game,
    period,
    minGames: CHART_MIN_GAMES,
    entries: entries.filter((e) => !e.me || e.rank <= CHART_SIZE),
    me: mine,
    myGames: gamesPlayed,
  }
}

/** Your record against one player, all games (or one). */
export async function headToHead(userId: string, username: string, game?: string) {
  const found = await pool.query<{ outcome: string; n: number; net: string }>(
    `SELECT r.outcome, COUNT(*)::int AS n, COALESCE(SUM(r.net), 0)::text AS net
     FROM game_results r
     JOIN characters me ON me.id = r.player_id AND me.user_id = $1
     JOIN characters them ON them.id = r.opponent_id
     JOIN users tu ON tu.id = them.user_id AND LOWER(tu.username) = LOWER($2)
     WHERE ($3::text IS NULL OR r.game = $3)
     GROUP BY r.outcome`,
    [userId, username.replace(/^@/, ''), game ?? null],
  )
  const by = (o: string) => found.rows.find((r) => r.outcome === o)
  return {
    ok: true as const,
    wins: by('win')?.n ?? 0,
    losses: by('loss')?.n ?? 0,
    draws: by('draw')?.n ?? 0,
    net: found.rows.reduce((s, r) => s + Number(r.net), 0),
  }
}

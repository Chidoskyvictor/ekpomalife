import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { BADGES, NO_UPGRADES, badgesEarned, rankFor, rankProgress, xpFor, xpForRepeat, type RunEvent, type Upgrades } from './race-rewards-rules.js'

/*
 * Racer rank (XP), badges and the upgrades a car carries. The server decides all of it: XP and badges
 * are only paid for runs the server accepted (a trial it opened and checked, or a stake race it settled).
 * The phone adds a few facts the server cannot see (crashed? night? comeback?); they only unlock
 * cosmetic badges, and XP never depends on them.
 */

type Db = Pick<PoolClient, 'query'>

export async function loadUpgrades(db: Db, carId: string): Promise<Upgrades> {
  const { rows } = await db.query<Upgrades>(`SELECT engine, tyres, brakes FROM car_upgrades WHERE car_id = $1`, [carId])
  return rows[0] ? { engine: rows[0].engine, tyres: rows[0].tyres, brakes: rows[0].brakes } : { ...NO_UPGRADES }
}

/** The upgrades on the car a player is driving now (stock if none). */
export async function activeCarUpgrades(db: Db, characterId: string): Promise<{ model: string | null; carId: string | null; up: Upgrades }> {
  const { rows } = await db.query<{ id: string; model: string }>(`SELECT id, model FROM car_holdings WHERE character_id = $1 AND active LIMIT 1`, [characterId])
  const car = rows[0]
  if (!car) return { model: null, carId: null, up: { ...NO_UPGRADES } }
  return { model: car.model, carId: car.id, up: await loadUpgrades(db, car.id) }
}

export async function statsOf(db: Db, characterId: string) {
  const { rows } = await db.query<{ xp: number; wins: number; races: number }>(`SELECT xp, wins, races FROM racer_stats WHERE character_id = $1`, [characterId])
  return rows[0] ?? { xp: 0, wins: 0, races: 0 }
}

export async function badgesOf(db: Db, characterId: string): Promise<string[]> {
  const { rows } = await db.query<{ badge: string }>(`SELECT badge FROM race_badges WHERE character_id = $1 ORDER BY earned_at`, [characterId])
  return rows.map((r) => r.badge)
}

/** Facts the phone reports about a run (cosmetic: they unlock badges, never XP). */
export type RunMeta = { place: number; of: number; beatFaster: number; beatAiSkill: number | null; crashed: boolean; night: boolean; comeback: boolean }

export type Reward = {
  xp: number
  totalXp: number
  rank: { id: string; name: string; emoji: string }
  rankedUp: boolean
  badges: string[]
}

/**
 * Pay XP and badges for one accepted run. `routeRank` is the player's place on the route's board after
 * this run (null if it was not a board run). Call inside the transaction that settles the run.
 */
export async function awardRun(db: Db, characterId: string, input: { mode: RunEvent['mode']; meta: RunMeta; personalBest: boolean; routeRank: number | null; repeat?: boolean }): Promise<Reward> {
  const { meta } = input
  const place = Math.max(1, Math.min(meta.of, meta.place))
  const event: RunEvent = { mode: input.mode, place, of: Math.max(1, meta.of), personalBest: input.personalBest, beatFaster: Math.min(3, Math.max(0, meta.beatFaster)), counted: true }
  const base = xpFor(event)
  const xp = input.repeat ? xpForRepeat(base, input.personalBest) : base
  const won = meta.of > 1 && place === 1
  const before = await statsOf(db, characterId)
  const { rows } = await db.query<{ xp: number; wins: number }>(
    `INSERT INTO racer_stats (character_id, xp, wins, races) VALUES ($1, $2, $3, 1)
     ON CONFLICT (character_id) DO UPDATE SET xp = racer_stats.xp + $2, wins = racer_stats.wins + $3, races = racer_stats.races + 1, updated_at = NOW()
     RETURNING xp, wins`,
    [characterId, xp, won ? 1 : 0],
  )
  const after = rows[0]!
  const owned = new Set(await badgesOf(db, characterId))
  const earned = badgesEarned({ wins: after.wins, routeRank: input.routeRank, won, beatAiSkill: meta.beatAiSkill, crashed: meta.crashed, night: meta.night, comeback: meta.comeback, finished: true }).filter((b) => !owned.has(b))
  for (const badge of earned) await db.query(`INSERT INTO race_badges (character_id, badge) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [characterId, badge])
  const rank = rankFor(after.xp)
  return { xp, totalXp: after.xp, rank: { id: rank.id, name: rank.name, emoji: rank.emoji }, rankedUp: rankFor(before.xp).id !== rank.id, badges: earned }
}

/** A race win against players (stake races): the winner gets XP and win badges. Losers get nothing here. */
export const awardPvpWin = (db: Db, characterId: string, racers: number, routeRank: number | null = null) =>
  awardRun(db, characterId, {
    mode: 'pvp',
    meta: { place: 1, of: Math.max(2, racers), beatFaster: 0, beatAiSkill: null, crashed: true, night: false, comeback: false },
    personalBest: false,
    routeRank,
  })

/** A player's racing card: rank and progress, record, badges. */
export async function racerCard(db: Db, characterId: string) {
  const [stats, badges] = await Promise.all([statsOf(db, characterId), badgesOf(db, characterId)])
  const p = rankProgress(stats.xp)
  return {
    xp: stats.xp,
    wins: stats.wins,
    races: stats.races,
    rank: { id: p.rank.id, name: p.rank.name, emoji: p.rank.emoji },
    next: p.next ? { name: p.next.name, emoji: p.next.emoji, toGo: p.toGo } : null,
    fraction: p.fraction,
    badges,
    allBadges: BADGES,
  }
}

/** XP of many players at once, for the board: id → xp. */
export async function xpOfMany(db: Db, characterIds: string[]) {
  if (characterIds.length === 0) return new Map<string, number>()
  const { rows } = await db.query<{ character_id: string; xp: number }>(`SELECT character_id, xp FROM racer_stats WHERE character_id = ANY($1::text[])`, [characterIds])
  return new Map(rows.map((r) => [r.character_id, r.xp]))
}

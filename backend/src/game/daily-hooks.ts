import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { applyCash, parseNeeds } from './game-state.js'
import { applyNeedDelta } from './needs.js'
import {
  STORY_BY_ID,
  STORY_EVENTS,
  cycleDay,
  nextStreak,
  pickStory,
  rewardForStreak,
  shouldOfferStory,
  type StoryEffects,
} from './daily-hooks-rules.js'
import { clockFromGameTime, realGameTime } from './time.js'

type Fail = { ok: false; code: number; error: string }
const fail = (code: number, error: string): Fail => ({ ok: false, code, error })

const todayDay = () => clockFromGameTime(realGameTime()).day

export type StreakView = {
  streak: number
  best: number
  /** Position 1–7 in the 7-day cycle (0 = never checked in) */
  cycleDay: number
  checkedInToday: boolean
  nextReward: number
  rewards: number[]
}

export type CheckinResult = StreakView & { granted: number; firstToday: boolean; cash: number | null; version: number | null }

type StreakRow = { current_streak: number; best_streak: number; last_checkin_day: number }

async function characterIdFor(client: PoolClient, userId: string): Promise<string | null> {
  const r = await client.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [userId])
  return r.rows[0]?.id ?? null
}

export function streakView(row: StreakRow | undefined, day: number): StreakView {
  const streak = row?.current_streak ?? 0
  const checkedInToday = Boolean(row && row.last_checkin_day === day)
  // A missed day means the streak is broken: the next check-in will be day 1
  const alive = row && (row.last_checkin_day === day || row.last_checkin_day === day - 1)
  const shown = alive ? streak : 0
  const upcoming = checkedInToday ? shown + 1 : (shown || 0) + 1
  return {
    streak: shown,
    best: row?.best_streak ?? 0,
    cycleDay: shown ? cycleDay(shown) : 0,
    checkedInToday,
    nextReward: rewardForStreak(upcoming),
    rewards: [5_000, 7_000, 10_000, 12_000, 15_000, 20_000, 50_000],
  }
}

export async function getStreak(userId: string): Promise<{ ok: true; streak: StreakView } | Fail> {
  const client = await pool.connect()
  try {
    const characterId = await characterIdFor(client, userId)
    if (!characterId) return fail(404, 'Create your character first.')
    const r = await client.query<StreakRow>(`SELECT current_streak, best_streak, last_checkin_day FROM login_streaks WHERE character_id = $1`, [characterId])
    return { ok: true, streak: streakView(r.rows[0], todayDay()) }
  } finally {
    client.release()
  }
}

/** Daily check-in: idempotent per Lagos day. Credits game_state.cash and writes a ledger row. */
export async function checkIn(userId: string): Promise<{ ok: true; checkin: CheckinResult } | Fail> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const characterId = await characterIdFor(client, userId)
    if (!characterId) {
      await client.query('ROLLBACK')
      return fail(404, 'Create your character first.')
    }
    const day = todayDay()
    await client.query(`INSERT INTO login_streaks (character_id) VALUES ($1) ON CONFLICT DO NOTHING`, [characterId])
    const locked = await client.query<StreakRow>(
      `SELECT current_streak, best_streak, last_checkin_day FROM login_streaks WHERE character_id = $1 FOR UPDATE`,
      [characterId],
    )
    const row = locked.rows[0]!
    const next = nextStreak({ day: row.last_checkin_day, streak: row.current_streak }, day)
    if (next == null) {
      await client.query('COMMIT')
      return { ok: true, checkin: { ...streakView(row, day), granted: 0, firstToday: false, cash: null, version: null } }
    }
    const granted = rewardForStreak(next)
    const paid = await applyCash(client, characterId, granted, `Daily check-in: day ${cycleDay(next)} streak`, 'daily_checkin')
    if (!paid.ok) {
      await client.query('ROLLBACK')
      return fail(409, 'Could not save your check-in. Try again.')
    }
    const best = Math.max(row.best_streak, next)
    await client.query(
      `UPDATE login_streaks SET current_streak = $2, best_streak = $3, last_checkin_day = $4, updated_at = NOW() WHERE character_id = $1`,
      [characterId, next, best, day],
    )
    await client.query('COMMIT')
    const view = streakView({ current_streak: next, best_streak: best, last_checkin_day: day }, day)
    return { ok: true, checkin: { ...view, granted, firstToday: true, cash: paid.cash, version: paid.version } }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

// —— Story moments ——

export type StoryView = {
  seq: number
  eventId: string
  emoji: string
  title: string
  text: string
  place: string
  choices: { label: string; hint: string }[]
}

type StoryRow = { day: number; seq: number; event_id: string; choice: number | null; created_at: Date }

const effectHint = (e: StoryEffects) =>
  [
    e.cash ? `${e.cash > 0 ? '+' : '−'}₦${Math.abs(e.cash).toLocaleString()}` : '',
    e.energy ? `${e.energy > 0 ? '+' : '−'}${Math.abs(e.energy)} energy` : '',
    e.reputation ? `${e.reputation > 0 ? '+' : '−'}${Math.abs(e.reputation)} rep` : '',
    e.fun ? `${e.fun > 0 ? '+' : '−'}${Math.abs(e.fun)} fun` : '',
    e.social ? `${e.social > 0 ? '+' : '−'}${Math.abs(e.social)} social` : '',
  ]
    .filter(Boolean)
    .join(' · ')

function storyViewOf(row: StoryRow): StoryView | null {
  const ev = STORY_BY_ID.get(row.event_id)
  if (!ev) return null
  return {
    seq: row.seq,
    eventId: ev.id,
    emoji: ev.emoji,
    title: ev.title,
    text: ev.text,
    place: ev.place,
    choices: ev.choices.map((c) => ({ label: c.label, hint: effectHint(c.effects) || 'No change' })),
  }
}

/**
 * The story to show now: a pending one, or (sometimes, max 2 a day) a fresh one chosen and recorded by the server.
 * `roll` / `rand` are injectable for tests.
 */
export async function nextStory(
  userId: string,
  opts: { roll?: number; rand?: number; nowMs?: number } = {},
): Promise<{ ok: true; story: StoryView | null } | Fail> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const characterId = await characterIdFor(client, userId)
    if (!characterId) {
      await client.query('ROLLBACK')
      return fail(404, 'Create your character first.')
    }
    // Serialise per player so two tabs can't both create a story
    await client.query(`SELECT 1 FROM characters WHERE id = $1 FOR UPDATE`, [characterId])
    const day = todayDay()
    const rows = (
      await client.query<StoryRow>(`SELECT day, seq, event_id, choice, created_at FROM story_events WHERE character_id = $1 ORDER BY day, seq`, [characterId])
    ).rows
    const pending = rows.find((r) => r.day === day && r.choice == null)
    if (pending) {
      await client.query('COMMIT')
      return { ok: true, story: storyViewOf(pending) }
    }
    const today = rows.filter((r) => r.day === day)
    const last = today[today.length - 1]
    const now = opts.nowMs ?? Date.now()
    if (!shouldOfferStory({ shownToday: today.length, lastShownAt: last ? new Date(last.created_at).getTime() : null, now, roll: opts.roll ?? Math.random() })) {
      await client.query('COMMIT')
      return { ok: true, story: null }
    }
    const kind = await client.query<{ character_type: string | null }>(`SELECT character_type FROM characters WHERE id = $1`, [characterId])
    const ev = pickStory(opts.rand ?? Math.random(), rows.map((r) => r.event_id), kind.rows[0]?.character_type === 'student')
    const seq = today.length + 1
    await client.query(`INSERT INTO story_events (character_id, day, seq, event_id) VALUES ($1, $2, $3, $4)`, [characterId, day, seq, ev.id])
    await client.query('COMMIT')
    return { ok: true, story: storyViewOf({ day, seq, event_id: ev.id, choice: null, created_at: new Date(now) }) }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export type StoryChoiceResult = { outcome: string; effects: StoryEffects; cash: number | null; version: number | null }

/** Apply a choice: cash through the ledger, needs/reputation on game_state (version bumped). Once per story. */
export async function chooseStory(userId: string, seq: number, choice: number): Promise<{ ok: true; result: StoryChoiceResult } | Fail> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const characterId = await characterIdFor(client, userId)
    if (!characterId) {
      await client.query('ROLLBACK')
      return fail(404, 'Create your character first.')
    }
    const day = todayDay()
    const found = await client.query<StoryRow>(
      `SELECT day, seq, event_id, choice, created_at FROM story_events WHERE character_id = $1 AND day = $2 AND seq = $3 FOR UPDATE`,
      [characterId, day, seq],
    )
    const row = found.rows[0]
    const ev = row ? STORY_BY_ID.get(row.event_id) : null
    if (!row || !ev) {
      await client.query('ROLLBACK')
      return fail(404, 'That moment has passed.')
    }
    if (row.choice != null) {
      await client.query('ROLLBACK')
      return fail(409, 'You already decided on this one.')
    }
    const picked = ev.choices[choice]
    if (!picked) {
      await client.query('ROLLBACK')
      return fail(400, 'Pick one of the two choices.')
    }
    const fx = picked.effects
    let cash: number | null = null
    let version: number | null = null
    if (fx.cash) {
      // Can't afford it? Pay what you have (never below zero).
      const bal = await client.query<{ cash: string | number }>(`SELECT cash FROM game_state WHERE character_id = $1 FOR UPDATE`, [characterId])
      const have = Number(bal.rows[0]?.cash ?? 0)
      const amount = fx.cash < 0 ? -Math.min(have, -fx.cash) : fx.cash
      if (amount !== 0) {
        const paid = await applyCash(client, characterId, amount, `${ev.title}: ${picked.label}`, 'story')
        if (!paid.ok) {
          await client.query('ROLLBACK')
          return fail(409, 'Could not apply that choice. Try again.')
        }
        cash = paid.cash
        version = paid.version
      }
    }
    if (fx.energy || fx.fun || fx.social || fx.reputation) {
      const gs = await client.query<{ needs: unknown }>(`SELECT needs FROM game_state WHERE character_id = $1 FOR UPDATE`, [characterId])
      const needs = applyNeedDelta(parseNeeds(gs.rows[0]?.needs as never), { energy: fx.energy ?? 0, fun: fx.fun ?? 0, social: fx.social ?? 0 })
      const upd = await client.query<{ version: number }>(
        `UPDATE game_state
         SET needs = $2::jsonb, reputation = LEAST(100, GREATEST(0, COALESCE(reputation, 50) + $3)),
             version = version + 1, updated_at = NOW()
         WHERE character_id = $1 RETURNING version`,
        [characterId, JSON.stringify(needs), fx.reputation ?? 0],
      )
      version = upd.rows[0]?.version ?? version
    }
    await client.query(`UPDATE story_events SET choice = $4, resolved_at = NOW() WHERE character_id = $1 AND day = $2 AND seq = $3`, [characterId, day, seq, choice])
    await client.query('COMMIT')
    return { ok: true, result: { outcome: picked.outcome, effects: fx, cash, version } }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export const STORY_COUNT = STORY_EVENTS.length

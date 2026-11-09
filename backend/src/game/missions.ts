import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { applyCash } from './game-state.js'
import {
  BOND_TARGET,
  DAILY_BONUS,
  MISSION_BY_ID,
  clueFor,
  hoursLabel,
  missionPlaces,
  pickDailyMissions,
  swapMission,
  TUTORIAL_IDS,
  type MissionDef,
} from './missions-rules.js'
import { clockFromGameTime, DAY_MINUTES, GAME_EPOCH_MS, realGameTime } from './time.js'

type Character = { id: string; character_type: string | null; course_id: string | null; location_id: string | null }

type DayRow = {
  mission_ids: string[]
  done_ids: string[]
  hidden_place: string
  swapped: boolean
  bonus_paid: boolean
  started_id: string | null
  started_at: Date | null
  bond_targets: string[]
}

export type MissionView = {
  id: string
  role: MissionDef['role']
  emoji: string
  title: string
  blurb: string
  places: string[]
  seconds: number
  reward: number
  done: boolean
  auto: MissionDef['auto'] | null
  hours: string | null
  risky: boolean
  /** Bond: people so far */
  progress: { now: number; goal: number } | null
  startedAt: number | null
}

export type MissionsView = {
  day: number
  missions: MissionView[]
  doneCount: number
  swapped: boolean
  bonus: number
  bonusPaid: boolean
  resetsAt: number
  locationId: string | null
  serverNowMs: number
}

type Fail = { ok: false; code: number; error: string }
const fail = (code: number, error: string): Fail => ({ ok: false, code, error })

const today = () => {
  const clock = clockFromGameTime(realGameTime())
  return { day: clock.day, hour: clock.hour }
}

async function loadCharacter(client: PoolClient, by: { userId?: string; characterId?: string }): Promise<Character | null> {
  const found = await client.query<Character>(
    `SELECT c.id, c.character_type, c.course_id, gs.location_id
     FROM characters c LEFT JOIN game_state gs ON gs.character_id = c.id
     WHERE ${by.userId ? 'c.user_id = $1' : 'c.id = $1'}`,
    [by.userId ?? by.characterId],
  )
  return found.rows[0] ?? null
}

async function doneOnce(client: PoolClient, characterId: string) {
  const rows = await client.query<{ mission_id: string }>(`SELECT mission_id FROM missions_once WHERE character_id = $1`, [characterId])
  return new Set(rows.rows.map((r) => r.mission_id))
}

/** Today's row, made the first time it's asked for. */
async function loadDay(client: PoolClient, ch: Character, day: number, lock: boolean): Promise<DayRow> {
  const select = `SELECT mission_ids, done_ids, hidden_place, swapped, bonus_paid, started_id, started_at, bond_targets
                  FROM daily_missions WHERE character_id = $1 AND day = $2 ${lock ? 'FOR UPDATE' : ''}`
  const found = await client.query<DayRow>(select, [ch.id, day])
  if (found.rows[0]) return found.rows[0]
  // Brand-new players (coach_progress row missing or tutorial not finished) get the tutorial missions first
  const tut = await client.query<{ tutorial_done: boolean }>(`SELECT tutorial_done FROM coach_progress WHERE character_id = $1`, [ch.id])
  const tutorial = !tut.rows[0] || !tut.rows[0].tutorial_done
  const picks = pickDailyMissions(`${ch.id}:${day}`, ch.character_type, await doneOnce(client, ch.id), tutorial)
  await client.query(
    `INSERT INTO daily_missions (character_id, day, mission_ids, hidden_place) VALUES ($1, $2, $3, $4)
     ON CONFLICT (character_id, day) DO NOTHING`,
    [ch.id, day, picks.ids, picks.hiddenPlace],
  )
  return (await client.query<DayRow>(select, [ch.id, day])).rows[0]!
}

function viewOf(row: DayRow, ch: Character, day: number): MissionsView {
  const missions = row.mission_ids
    .map((id) => MISSION_BY_ID.get(id))
    .filter((def): def is MissionDef => Boolean(def))
    .map((def) => ({
      id: def.id,
      role: def.role,
      emoji: def.emoji,
      title: def.title,
      blurb: def.places === 'hidden' ? `Clue: ${clueFor(row.hidden_place)}` : def.blurb,
      places: missionPlaces(def, { courseId: ch.course_id, hiddenPlace: row.hidden_place }),
      seconds: def.seconds,
      reward: def.reward,
      done: row.done_ids.includes(def.id),
      auto: def.auto ?? null,
      hours: def.hours ? hoursLabel(def.hours) : null,
      risky: Boolean(def.risk),
      progress: def.auto === 'bond' ? { now: Math.min(BOND_TARGET, row.bond_targets.length), goal: BOND_TARGET } : null,
      startedAt: row.started_id === def.id && row.started_at ? new Date(row.started_at).getTime() : null,
    }))
  return {
    day,
    missions,
    doneCount: missions.filter((m) => m.done).length,
    swapped: row.swapped,
    bonus: DAILY_BONUS,
    bonusPaid: row.bonus_paid,
    resetsAt: GAME_EPOCH_MS + day * DAY_MINUTES * 60_000,
    locationId: ch.location_id,
    serverNowMs: Date.now(),
  }
}

/** Mark a mission done and pay for it (and the daily bonus when it's the last of the 3). */
async function complete(client: PoolClient, ch: Character, day: number, row: DayRow, def: MissionDef): Promise<string> {
  let message: string
  if (def.risk && Math.random() < def.risk.chance) {
    // Caught: pay the fine (as much as you have), no reward
    const fined = await applyCash(client, ch.id, -def.risk.fine, `Fined: ${def.title}`, 'mission_fine')
    message = fined.ok
      ? `🚨 Security caught you! Fined ₦${def.risk.fine.toLocaleString()}.`
      : '🚨 Security caught you and sent you away.'
  } else {
    await applyCash(client, ch.id, def.reward, `Mission: ${def.title}`, 'mission')
    message = `${def.emoji} ${def.title} done! +₦${def.reward.toLocaleString()}`
  }
  const doneIds = [...row.done_ids, def.id]
  const allDone = row.mission_ids.every((id) => doneIds.includes(id))
  const payBonus = allDone && !row.bonus_paid
  if (payBonus) {
    await applyCash(client, ch.id, DAILY_BONUS, 'Daily missions bonus', 'mission_bonus')
    message += ` 🎁 All 3 done: +₦${DAILY_BONUS.toLocaleString()} bonus!`
  }
  await client.query(
    `UPDATE daily_missions SET done_ids = $3, bonus_paid = bonus_paid OR $4, started_id = NULL, started_at = NULL
     WHERE character_id = $1 AND day = $2`,
    [ch.id, day, doneIds, payBonus],
  )
  if (TUTORIAL_IDS.includes(def.id) && TUTORIAL_IDS.every((id) => id === def.id || doneIds.includes(id))) {
    await client.query(
      `INSERT INTO coach_progress (character_id, tutorial_done) VALUES ($1, TRUE)
       ON CONFLICT (character_id) DO UPDATE SET tutorial_done = TRUE, updated_at = NOW()`,
      [ch.id],
    )
  }
  if (def.once) {
    await client.query(`INSERT INTO missions_once (character_id, mission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ch.id, def.id])
  }
  return message
}

export async function getMissions(userId: string): Promise<{ ok: true; missions: MissionsView } | Fail> {
  const client = await pool.connect()
  try {
    const ch = await loadCharacter(client, { userId })
    if (!ch) return fail(404, 'Create your character first.')
    const { day } = today()
    return { ok: true, missions: viewOf(await loadDay(client, ch, day, false), ch, day) }
  } finally {
    client.release()
  }
}

export type MissionAction = 'start' | 'finish' | 'swap'

/** Start a mission at its place, finish it after its seconds, or swap it (once a day). */
export async function missionAction(
  userId: string,
  action: MissionAction,
  missionId: string,
): Promise<{ ok: true; missions: MissionsView; message: string } | Fail> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const refuse = async (error: string, code = 409) => {
      await client.query('ROLLBACK')
      return fail(code, error)
    }
    const ch = await loadCharacter(client, { userId })
    if (!ch) return refuse('Create your character first.', 404)
    const { day, hour } = today()
    const row = await loadDay(client, ch, day, true)
    const def = MISSION_BY_ID.get(missionId)
    if (!def || !row.mission_ids.includes(missionId)) return refuse("That isn't one of today's missions.", 404)
    if (row.done_ids.includes(missionId)) return refuse('Already done today ✅')

    const finish = async (message: string) => {
      await client.query('COMMIT')
      const fresh = await loadDay(client, ch, day, false)
      return { ok: true as const, missions: viewOf(fresh, ch, day), message }
    }

    if (action === 'swap') {
      if (row.swapped) return refuse('You already used your free swap today.')
      if (row.started_id === missionId) return refuse('Finish or cancel this one first.')
      const next = swapMission(`${ch.id}:${day}`, ch.character_type, row.mission_ids, missionId, await doneOnce(client, ch.id))
      if (!next) return refuse('No other mission to swap in.')
      const ids = row.mission_ids.map((id) => (id === missionId ? next : id))
      await client.query(`UPDATE daily_missions SET mission_ids = $3, swapped = TRUE WHERE character_id = $1 AND day = $2`, [ch.id, day, ids])
      return finish(`Swapped in: ${MISSION_BY_ID.get(next)?.title ?? 'a new mission'}`)
    }

    if (def.auto === 'lecture') return refuse('This one completes when you attend a lecture.')
    if (def.auto === 'bond') return refuse('This one completes as you wave, laugh or chat with people.')
    const places = missionPlaces(def, { courseId: ch.course_id, hiddenPlace: row.hidden_place })
    if (!places.includes(ch.location_id ?? '')) return refuse('Go to the right place first.')
    if (def.hours && !(hour >= def.hours.open && hour < def.hours.close)) return refuse(`Only ${hoursLabel(def.hours)}.`)

    if (action === 'start') {
      await client.query(`UPDATE daily_missions SET started_id = $3, started_at = NOW() WHERE character_id = $1 AND day = $2`, [ch.id, day, missionId])
      return finish(`${def.emoji} ${def.title}…`)
    }

    // finish: must have started this one and waited its seconds (a little slack for the network)
    if (row.started_id !== missionId || !row.started_at) return refuse('Start the mission first.')
    const elapsed = (Date.now() - new Date(row.started_at).getTime()) / 1000
    if (elapsed < def.seconds - 2) return refuse('Not done yet. Hang on a few more seconds.')
    return finish(await complete(client, ch, day, row, def))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Missions finished by real actions, inside the caller's transaction:
 * 'lecture' after a lecture, 'bond' after waving / laughing / chatting with someone (`target`).
 * Never throws: a mission problem must not undo the lecture or the wave.
 */
export async function missionProgress(client: PoolClient, characterId: string, kind: 'lecture' | 'bond' | 'eat' | 'ride' | 'text', target?: string): Promise<string | null> {
  try {
    await client.query('SAVEPOINT mission_progress')
    const ch = await loadCharacter(client, { characterId })
    if (!ch) return null
    const { day } = today()
    const row = await loadDay(client, ch, day, true)
    const def = row.mission_ids.map((id) => MISSION_BY_ID.get(id)).find((m) => m?.auto === kind)
    if (!def || row.done_ids.includes(def.id)) {
      await client.query('RELEASE SAVEPOINT mission_progress')
      return null
    }
    let message: string | null = null
    if (kind !== 'bond') {
      message = await complete(client, ch, day, row, def)
    } else if (target && !row.bond_targets.includes(target)) {
      const targets = [...row.bond_targets, target]
      await client.query(`UPDATE daily_missions SET bond_targets = $3 WHERE character_id = $1 AND day = $2`, [ch.id, day, targets])
      if (targets.length >= BOND_TARGET) message = await complete(client, ch, day, { ...row, bond_targets: targets }, def)
    }
    await client.query('RELEASE SAVEPOINT mission_progress')
    return message
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT mission_progress').catch(() => {})
    return null
  }
}

/**
 * For routes that finished a real action (ate, rode, texted) outside a transaction of their own:
 * ticks the matching tutorial mission. Never throws and never blocks the action.
 */
export async function missionProgressFor(userId: string, kind: 'eat' | 'ride' | 'text'): Promise<string | null> {
  let client: PoolClient | null = null
  try {
    client = await pool.connect()
    await client.query('BEGIN')
    const ch = await loadCharacter(client, { userId })
    if (!ch) {
      await client.query('ROLLBACK')
      return null
    }
    const message = await missionProgress(client, ch.id, kind)
    await client.query('COMMIT')
    return message
  } catch {
    await client?.query('ROLLBACK').catch(() => {})
    return null
  } finally {
    client?.release()
  }
}

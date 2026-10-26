import { randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { env } from '../env.js'
import { createId } from '../ids.js'
import { requireEconomySetup } from './economy.js'
import { PLACE_IDS } from './places.js'
import { VENUES } from './venues.js'
import {
  autoEndReason,
  canPublish,
  canStartScheduled,
  checkScheduleSlot,
  checkComment,
  checkTitle,
  COMMENT_GAP_MS,
  createCapReached,
  joinCodeFrom,
  lagosDayStart,
  MAX_LISTENERS,
  ROOMS_PER_DAY,
  participantMinutes,
  spacesBudget,
  type AutoEndReason,
  type SpaceRole,
  type SpaceStatus,
  type Visibility,
} from './spaces-rules.js'
import {
  createRoom,
  deleteRoom,
  joinToken,
  listParticipants,
  liveKitConfig,
  removeParticipant,
  setPublish,
  spaceIdFromRoom,
  type WebhookEvent,
} from './livekit.js'

export type SpacesFail = { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): SpacesFail => ({ ok: false, status, code, error })

type SpaceRow = {
  id: string
  host_id: string
  title: string
  place_id: string | null
  visibility: Visibility
  join_code: string
  scheduled_at: Date | null
  started_at: Date | null
  ended_at: Date | null
  max_listeners: number
  ask_to_speak: boolean
  status: SpaceStatus
  cap_minutes: number
  end_reason: string | null
  created_at: Date
}

const log = (what: string, error: unknown) => console.warn(`[spaces] ${what}:`, error instanceof Error ? error.message : error)

// ---------------------------------------------------------------- listing

type ListTab = 'live' | 'upcoming' | 'mine' | 'here'

const LIST_SELECT = `
  SELECT s.*, u.username AS host_username,
    (SELECT COUNT(*)::int FROM space_members m WHERE m.space_id = s.id AND m.left_at IS NULL) AS present,
    (SELECT COUNT(*)::int FROM space_members m WHERE m.space_id = s.id AND m.left_at IS NULL AND m.role <> 'listener') AS speakers,
    (SELECT COALESCE(json_agg(f.username), '[]'::json) FROM (
       SELECT fu.username FROM space_members fm JOIN users fu ON fu.id = fm.user_id
       WHERE fm.space_id = s.id AND fm.left_at IS NULL
       ORDER BY (fm.role = 'host') DESC, (fm.role = 'speaker') DESC, fm.joined_at LIMIT 3) f) AS faces
  FROM spaces s JOIN users u ON u.id = s.host_id`

function toCard(row: SpaceRow & { host_username: string; present: number; speakers: number; faces: string[] }, userId: string) {
  const mine = row.host_id === userId
  return {
    id: row.id,
    title: row.title,
    host: { id: row.host_id, username: row.host_username },
    placeId: row.place_id,
    visibility: row.visibility,
    status: row.status,
    scheduledAt: row.scheduled_at?.toISOString() ?? null,
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
    endsBy: row.started_at ? new Date(row.started_at.getTime() + row.cap_minutes * 60_000).toISOString() : null,
    maxListeners: row.max_listeners,
    askToSpeak: row.ask_to_speak,
    present: row.present,
    speakers: row.speakers,
    // Up to 3 usernames for the card's avatar stack: host, speakers, then earliest listeners
    faces: row.faces,
    mine,
    // Only the host sees the code; they share it themselves
    joinCode: mine ? row.join_code : undefined,
  }
}

export async function listSpaces(userId: string, tab: ListTab, placeId: string | null) {
  let rows
  if (tab === 'live') {
    rows = await pool.query(`${LIST_SELECT} WHERE s.status = 'live' AND s.visibility = 'public' ORDER BY s.started_at DESC LIMIT 50`)
  } else if (tab === 'upcoming') {
    rows = await pool.query(
      `${LIST_SELECT} WHERE s.status = 'scheduled' AND s.visibility = 'public' AND s.scheduled_at IS NOT NULL
       ORDER BY s.scheduled_at ASC LIMIT 50`,
    )
  } else if (tab === 'mine') {
    rows = await pool.query(`${LIST_SELECT} WHERE s.host_id = $1 ORDER BY s.created_at DESC LIMIT 30`, [userId])
  } else {
    if (!placeId) return fail(400, 'PLACE_REQUIRED', 'Pick a place to see its Spaces.')
    rows = await pool.query(
      `${LIST_SELECT} WHERE s.status = 'live' AND s.visibility = 'public' AND s.place_id = $1 ORDER BY s.started_at DESC LIMIT 50`,
      [placeId],
    )
  }
  return { ok: true as const, tab, spaces: rows.rows.map((row) => toCard(row, userId)) }
}

export async function getSpace(userId: string, spaceId: string) {
  const found = await pool.query(`${LIST_SELECT} WHERE s.id = $1`, [spaceId])
  const row = found.rows[0]
  if (!row) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  const isHost = row.host_id === userId
  const member = await pool.query(`SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2`, [spaceId, userId])
  if (row.visibility === 'invite' && !isHost && !member.rowCount) return fail(403, 'INVITE_ONLY', 'This Space is invite-only. Ask the host for the code.')
  const people = await pool.query<{ user_id: string; username: string; role: SpaceRole; speak_requested_at: Date | null }>(
    `SELECT m.user_id, u.username, m.role, m.speak_requested_at FROM space_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.space_id = $1 AND m.left_at IS NULL ORDER BY m.joined_at LIMIT 200`,
    [spaceId],
  )
  return {
    ok: true as const,
    space: toCard(row, userId),
    people: people.rows.map((p) => ({
      userId: p.user_id,
      username: p.username,
      role: p.role,
      // Only the host needs the hand-raise queue
      askedToSpeak: isHost ? p.speak_requested_at?.toISOString() ?? null : undefined,
    })),
  }
}

// ---------------------------------------------------------------- create

export type CreateInput = {
  title: string
  placeId?: string | null
  visibility: Visibility
  scheduledAt?: string | null
  maxListeners?: number
  askToSpeak?: boolean
}

async function validPlace(placeId: string): Promise<boolean> {
  if (PLACE_IDS.includes(placeId) || placeId in VENUES) return true
  const hostel = await pool.query(`SELECT 1 FROM hostels WHERE id = $1`, [placeId])
  return (hostel.rowCount ?? 0) > 0
}

async function newJoinCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = joinCodeFrom(randomBytes(6))
    const taken = await pool.query(`SELECT 1 FROM spaces WHERE join_code = $1`, [code])
    if (!taken.rowCount) return code
  }
  throw new Error('Could not find a free join code')
}

export async function createSpace(userId: string, input: CreateInput) {
  const now = new Date()
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return fail(gate.code, 'SETUP_INCOMPLETE', gate.error)

  const barred = await pool.query(`SELECT 1 FROM space_host_bans WHERE user_id = $1`, [userId])
  if (barred.rowCount) return fail(403, 'HOST_BANNED', 'You can’t host Spaces anymore. You can still listen.')

  const title = checkTitle(input.title)
  if (!title.ok) return fail(400, title.code, title.error)

  const placeId = input.placeId?.trim() || null
  if (placeId && !(await validPlace(placeId))) return fail(400, 'BAD_PLACE', 'Pick a real place for your Space.')

  let scheduledAt: Date | null = null
  if (input.scheduledAt) {
    const slot = checkScheduleSlot(new Date(input.scheduledAt), now)
    if (!slot.ok) return fail(400, slot.code, slot.error)
    scheduledAt = slot.at
  } else if (!liveKitConfig()) {
    return fail(503, 'SPACES_OFF', 'Spaces aren’t switched on yet.')
  }

  const today = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM spaces WHERE host_id = $1 AND created_at >= $2`,
    [userId, lagosDayStart(now)],
  )
  if (createCapReached(today.rows[0]?.n ?? 0)) {
    return fail(429, 'DAILY_LIMIT', `You can start ${ROOMS_PER_DAY} Spaces a day. Try again tomorrow.`)
  }

  const id = createId()
  const maxListeners = Math.min(MAX_LISTENERS, Math.max(1, Math.floor(input.maxListeners ?? MAX_LISTENERS)))
  await pool.query(
    `INSERT INTO spaces (id, host_id, title, place_id, visibility, join_code, scheduled_at, max_listeners, ask_to_speak, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled')`,
    [id, userId, title.title, placeId, input.visibility, await newJoinCode(), scheduledAt, maxListeners, input.askToSpeak ?? true],
  )

  if (scheduledAt) {
    const space = await getSpace(userId, id)
    return space.ok ? { ok: true as const, space: space.space } : space
  }
  // Start now: the host goes straight in. If that fails (budget), the room never existed.
  const joined = await joinSpace(userId, id, { viaCode: false })
  if (!joined.ok) {
    await pool.query(`DELETE FROM spaces WHERE id = $1 AND status = 'scheduled'`, [id])
    return joined
  }
  return joined
}

// ---------------------------------------------------------------- join

type Db = Pick<PoolClient, 'query'>

/**
 * Close open sessions matching `where` (params start at $1) and add their participant-seconds
 * to today's usage. Every "someone left" path goes through here so the budget stays honest.
 */
async function closeSessions(db: Db, where: string, params: unknown[]) {
  await db.query(
    `WITH closed AS (
       UPDATE space_members SET left_at = NOW() WHERE left_at IS NULL AND (${where}) RETURNING joined_at
     )
     INSERT INTO space_usage_days (day, participant_seconds)
     SELECT (NOW() AT TIME ZONE 'Africa/Lagos')::date, COALESCE(SUM(EXTRACT(EPOCH FROM NOW() - joined_at)), 0)::bigint FROM closed
     ON CONFLICT (day) DO UPDATE SET participant_seconds = space_usage_days.participant_seconds + EXCLUDED.participant_seconds`,
    params,
  )
}

/** Today's participant-minutes against SPACES_DAILY_MINUTES. */
export async function spacesBudgetToday(db: Db = pool, now = new Date()) {
  const closed = await db.query<{ seconds: string }>(
    `SELECT participant_seconds::text AS seconds FROM space_usage_days WHERE day = (NOW() AT TIME ZONE 'Africa/Lagos')::date`,
  )
  const open = await db.query<{ joined_at: Date }>(
    `SELECT m.joined_at FROM space_members m JOIN spaces s ON s.id = m.space_id WHERE m.left_at IS NULL AND s.status = 'live'`,
  )
  const used = participantMinutes(Number(closed.rows[0]?.seconds ?? 0), open.rows.map((r) => r.joined_at), now)
  return spacesBudget(used, env.SPACES_DAILY_MINUTES)
}

export async function joinSpace(userId: string, spaceId: string, opts: { viaCode: boolean }) {
  const cfg = liveKitConfig()
  if (!cfg) return fail(503, 'SPACES_OFF', 'Spaces aren’t switched on yet.')
  const now = new Date()
  let wentLive = false
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const found = await client.query<SpaceRow>(`SELECT * FROM spaces WHERE id = $1 FOR UPDATE`, [spaceId])
    let space = found.rows[0]
    if (!space) return rollback(client, fail(404, 'NOT_FOUND', 'That Space doesn’t exist.'))
    if (space.status === 'ended') return rollback(client, fail(410, 'ENDED', 'This Space has ended.'))
    const isHost = space.host_id === userId

    const banned = await client.query(`SELECT 1 FROM space_bans WHERE space_id = $1 AND user_id = $2`, [spaceId, userId])
    if (banned.rowCount) return rollback(client, fail(403, 'BANNED', 'The host removed you from this Space.'))

    const existing = await client.query<{ role: SpaceRole }>(`SELECT role FROM space_members WHERE space_id = $1 AND user_id = $2`, [spaceId, userId])
    if (space.visibility === 'invite' && !isHost && !opts.viaCode && !existing.rowCount) {
      return rollback(client, fail(403, 'INVITE_ONLY', 'This Space is invite-only. Ask the host for the code.'))
    }

    if (space.status === 'scheduled') {
      if (!isHost) return rollback(client, fail(409, 'NOT_STARTED', 'This Space hasn’t started yet.'))
      if (!canStartScheduled(space.scheduled_at, now)) {
        return rollback(client, fail(409, 'TOO_EARLY', 'You can start this Space from 10 minutes before its time.'))
      }
      // One room goes live at a time so two can't both squeeze into the last minutes
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('spaces_daily_budget'))`)
      if (!(await spacesBudgetToday(client, now)).canStart) {
        return rollback(client, fail(503, 'BUDGET_SPENT', 'Spaces are full for today. Try again tomorrow.'))
      }
      const live = await client.query<SpaceRow>(
        `UPDATE spaces SET status = 'live', started_at = $2 WHERE id = $1 RETURNING *`,
        [spaceId, now],
      )
      space = live.rows[0]!
      wentLive = true
    } else if (!(await spacesBudgetToday(client, now)).canJoin) {
      return rollback(client, fail(503, 'BUDGET_SPENT', 'Spaces are full for today. Try again tomorrow.'))
    }

    if (!isHost && !existing.rows[0]) {
      const count = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM space_members WHERE space_id = $1 AND left_at IS NULL AND role <> 'host' AND user_id <> $2`,
        [spaceId, userId],
      )
      if ((count.rows[0]?.n ?? 0) >= space.max_listeners) return rollback(client, fail(409, 'FULL', 'This Space is full.'))
    }

    // Returning speakers keep their mic; everyone else starts as a listener
    const role: SpaceRole = isHost ? 'host' : existing.rows[0]?.role === 'speaker' ? 'speaker' : 'listener'
    // Rejoining while still marked present: bank the old session's minutes first
    await closeSessions(client, 'space_id = $1 AND user_id = $2', [spaceId, userId])
    await client.query(
      `INSERT INTO space_members (space_id, user_id, role, joined_at, left_at) VALUES ($1, $2, $3, NOW(), NULL)
       ON CONFLICT (space_id, user_id) DO UPDATE SET role = $3, joined_at = NOW(), left_at = NULL`,
      [spaceId, userId, role],
    )
    const name = await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userId])
    await client.query('COMMIT')

    if (wentLive) {
      await createRoom(cfg, spaceId, space.max_listeners + 1).catch((error) => log('CreateRoom', error))
    }
    const endsBy = space.started_at!.getTime() + space.cap_minutes * 60_000
    const token = joinToken(cfg, {
      spaceId,
      userId,
      name: name.rows[0]?.username ?? 'player',
      canPublish: canPublish(role),
      ttlSeconds: (endsBy - now.getTime()) / 1000 + 60,
      metadata: JSON.stringify({ role }),
    })
    return {
      ok: true as const,
      spaceId,
      role,
      livekit: { url: cfg.url, token },
      // Everyone starts muted — the client keeps the mic off until the person taps it
      startMuted: true,
      endsBy: new Date(endsBy).toISOString(),
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function rollback(client: PoolClient, result: SpacesFail): Promise<SpacesFail> {
  await client.query('ROLLBACK')
  return result
}

export async function joinByCode(userId: string, code: string) {
  const found = await pool.query<{ id: string }>(`SELECT id FROM spaces WHERE join_code = $1 AND status <> 'ended'`, [code])
  const id = found.rows[0]?.id
  if (!id) return fail(404, 'BAD_CODE', 'No live Space with that code.')
  return joinSpace(userId, id, { viaCode: true })
}

// ---------------------------------------------------------------- leave / end

async function loadSpace(spaceId: string) {
  const found = await pool.query<SpaceRow>(`SELECT * FROM spaces WHERE id = $1`, [spaceId])
  return found.rows[0] ?? null
}

/** End a room for everyone. Safe to call twice; only the first call does anything. */
export async function finishSpace(spaceId: string, reason: AutoEndReason | 'host_ended' | 'livekit_closed' | 'admin_ended') {
  const ended = await pool.query(
    `UPDATE spaces SET status = 'ended', ended_at = NOW(), end_reason = $2
     WHERE id = $1 AND status <> 'ended' RETURNING started_at`,
    [spaceId, reason],
  )
  if (!ended.rowCount) return false
  await closeSessions(pool, 'space_id = $1', [spaceId])
  const cfg = liveKitConfig()
  if (cfg && ended.rows[0]?.started_at) await deleteRoom(cfg, spaceId).catch((error) => log('DeleteRoom', error))
  return true
}

export async function endSpace(userId: string, spaceId: string) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  if (space.host_id !== userId) return fail(403, 'HOST_ONLY', 'Only the host can end this Space.')
  if (space.status === 'ended') return { ok: true as const, ended: false }
  await finishSpace(spaceId, 'host_ended')
  return { ok: true as const, ended: true }
}

/** Leaving: the host walking out ends the room for everyone. */
export async function leaveSpace(userId: string, spaceId: string) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  if (space.host_id === userId && space.status === 'live') {
    await finishSpace(spaceId, 'host_left')
    return { ok: true as const, ended: true }
  }
  await closeSessions(pool, 'space_id = $1 AND user_id = $2', [spaceId, userId])
  return { ok: true as const, ended: false }
}

// ---------------------------------------------------------------- moderation

export async function reportSpace(userId: string, spaceId: string, reason: string) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  if (space.host_id === userId) return fail(400, 'OWN_SPACE', 'You can’t report your own Space.')
  await pool.query(
    `INSERT INTO space_reports (id, space_id, reporter_id, reason) VALUES ($1, $2, $3, $4)
     ON CONFLICT (space_id, reporter_id) DO NOTHING`,
    [createId(), spaceId, userId, reason.trim().slice(0, 300)],
  )
  return { ok: true as const, message: 'Thanks — we’ll take a look.' }
}

export async function banFromSpace(userId: string, spaceId: string, targetId: string) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  if (space.host_id !== userId) return fail(403, 'HOST_ONLY', 'Only the host can remove people.')
  if (targetId === userId) return fail(400, 'SELF', 'You can’t remove yourself. End the Space instead.')
  const target = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [targetId])
  if (!target.rowCount) return fail(404, 'NO_PLAYER', 'No such player.')
  await pool.query(`INSERT INTO space_bans (space_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [spaceId, targetId])
  await closeSessions(pool, 'space_id = $1 AND user_id = $2', [spaceId, targetId])
  await pool.query(`UPDATE space_members SET role = 'listener', speak_requested_at = NULL WHERE space_id = $1 AND user_id = $2`, [
    spaceId,
    targetId,
  ])
  const cfg = liveKitConfig()
  if (cfg && space.status === 'live') await removeParticipant(cfg, spaceId, targetId).catch((error) => log('RemoveParticipant', error))
  return { ok: true as const }
}

async function presentMember(spaceId: string, userId: string) {
  const found = await pool.query<{ role: SpaceRole }>(
    `SELECT m.role FROM space_members m JOIN spaces s ON s.id = m.space_id
     WHERE m.space_id = $1 AND m.user_id = $2 AND m.left_at IS NULL AND s.status = 'live'`,
    [spaceId, userId],
  )
  return found.rows[0] ?? null
}

async function setSpeaker(spaceId: string, targetId: string, speaker: boolean) {
  await pool.query(
    `UPDATE space_members SET role = $3, speak_requested_at = NULL WHERE space_id = $1 AND user_id = $2 AND role <> 'host'`,
    [spaceId, targetId, speaker ? 'speaker' : 'listener'],
  )
  const cfg = liveKitConfig()
  // If LiveKit misses this, the person's next /join token carries the right rights anyway
  if (cfg) await setPublish(cfg, spaceId, targetId, speaker).catch((error) => log('UpdateParticipant', error))
}

export async function requestSpeak(userId: string, spaceId: string) {
  const space = await loadSpace(spaceId)
  if (!space || space.status !== 'live') return fail(409, 'NOT_LIVE', 'This Space isn’t live.')
  const me = await presentMember(spaceId, userId)
  if (!me) return fail(403, 'NOT_IN_SPACE', 'Join the Space first.')
  if (me.role !== 'listener') return { ok: true as const, role: me.role }
  if (!space.ask_to_speak) {
    await setSpeaker(spaceId, userId, true)
    return { ok: true as const, role: 'speaker' as const }
  }
  await pool.query(
    `UPDATE space_members SET speak_requested_at = COALESCE(speak_requested_at, NOW()) WHERE space_id = $1 AND user_id = $2`,
    [spaceId, userId],
  )
  return { ok: true as const, role: 'listener' as const, requested: true }
}

export async function approveSpeaker(userId: string, spaceId: string, targetId: string, approve: boolean) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  if (space.host_id !== userId) return fail(403, 'HOST_ONLY', 'Only the host can pick speakers.')
  if (space.status !== 'live') return fail(409, 'NOT_LIVE', 'This Space isn’t live.')
  if (targetId === userId) return fail(400, 'SELF', 'You’re the host — your mic is already yours.')
  const target = await presentMember(spaceId, targetId)
  if (!target) return fail(404, 'NOT_IN_SPACE', 'They’re not in this Space.')
  await setSpeaker(spaceId, targetId, approve)
  return { ok: true as const, userId: targetId, role: approve ? ('speaker' as const) : ('listener' as const) }
}

// ---------------------------------------------------------------- sweeper + webhook

/**
 * Runs every minute: ends rooms past their cap, rooms whose host has gone, rooms empty for
 * 5 minutes, and scheduled rooms nobody started. Syncs presence with LiveKit when it can.
 */
export async function sweepSpaces(now = new Date()) {
  const cfg = liveKitConfig()
  // Daily participant-minutes spent: close every live room (LiveKit's free plan is a hard cap)
  if ((await spacesBudgetToday(pool, now)).exhausted) {
    const live = await pool.query<{ id: string }>(`SELECT id FROM spaces WHERE status = 'live'`)
    for (const room of live.rows) await finishSpace(room.id, 'budget').catch((error) => log(`budget end ${room.id}`, error))
  }
  const rooms = await pool.query<SpaceRow>(`SELECT * FROM spaces WHERE status IN ('live', 'scheduled') AND (status = 'live' OR scheduled_at IS NOT NULL)`)
  for (const space of rooms.rows) {
    try {
      let hostConnected: boolean | null = null
      if (cfg && space.status === 'live') {
        try {
          const inRoom = new Set(await listParticipants(cfg, space.id))
          hostConnected = inRoom.has(space.host_id)
          // Anyone we think is present but LiveKit doesn't have (after a short grace) has left
          await closeSessions(pool, 'space_id = $1 AND joined_at < $2 AND NOT (user_id = ANY($3::text[]))', [
            space.id,
            new Date(now.getTime() - 2 * 60_000),
            [...inRoom],
          ])
        } catch (error) {
          // A room LiveKit doesn't know about is just empty; anything else, fall back to DB presence
          if (error instanceof Error && / 404:/.test(error.message)) hostConnected = false
          else log('ListParticipants', error)
        }
      }
      const presence = await pool.query<{ present: number; last: Date | null; host_joined: Date | null }>(
        `SELECT COUNT(*) FILTER (WHERE left_at IS NULL)::int AS present,
                MAX(GREATEST(joined_at, COALESCE(left_at, joined_at))) AS last,
                MAX(joined_at) FILTER (WHERE role = 'host') AS host_joined
         FROM space_members WHERE space_id = $1`,
        [space.id],
      )
      const p = presence.rows[0]
      const reason = autoEndReason({
        status: space.status,
        now,
        scheduledAt: space.scheduled_at,
        startedAt: space.started_at,
        capMinutes: space.cap_minutes,
        hostConnected,
        hostJoinedAt: p?.host_joined ?? null,
        presentCount: p?.present ?? 0,
        lastActivityAt: p?.last ?? null,
      })
      if (reason) await finishSpace(space.id, reason)
    } catch (error) {
      log(`sweep ${space.id}`, error)
    }
  }
}

/** LiveKit webhook: react at once when the host drops or the room closes. */
export async function handleLiveKitEvent(event: WebhookEvent) {
  const spaceId = event.room?.name ? spaceIdFromRoom(event.room.name) : null
  if (!spaceId) return
  if (event.event === 'room_finished') {
    await finishSpace(spaceId, 'livekit_closed')
    return
  }
  const identity = event.participant?.identity
  if (event.event === 'participant_left' && identity) {
    const space = await loadSpace(spaceId)
    if (!space || space.status !== 'live') return
    if (identity === space.host_id) {
      // A host rejoining with a fresh token kicks their old connection (duplicate identity) —
      // only end when they're really gone
      const cfg = liveKitConfig()
      const still = cfg ? await listParticipants(cfg, spaceId).catch(() => [] as string[]) : []
      if (still.includes(identity)) return
      await finishSpace(spaceId, 'host_left')
      return
    }
    await closeSessions(pool, 'space_id = $1 AND user_id = $2', [spaceId, identity])
  }
}

// ---------------------------------------------------------------- comments

/** Comments in a live room: only people who are in it can read or write. */
async function commentGate(userId: string, spaceId: string) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  if (space.status !== 'live') return fail(409, 'NOT_LIVE', 'This Space isn’t live.')
  const me = await presentMember(spaceId, userId)
  if (!me) return fail(403, 'NOT_IN_SPACE', 'Join the Space first.')
  return null
}

export async function postComment(userId: string, spaceId: string, text: string) {
  const blocked = await commentGate(userId, spaceId)
  if (blocked) return blocked
  const check = checkComment(text)
  if (!check.ok) return fail(400, check.code, check.error)
  // Compared in the database so a clock difference between the app and Postgres can't misfire
  const recent = await pool.query(
    `SELECT 1 FROM space_comments WHERE space_id = $1 AND user_id = $2 AND created_at > NOW() - ($3::int * INTERVAL '1 millisecond') LIMIT 1`,
    [spaceId, userId, COMMENT_GAP_MS],
  )
  if (recent.rowCount) return fail(429, 'TOO_FAST', 'Slow down a little.')
  const id = createId()
  const inserted = await pool.query<{ created_at: Date }>(
    `INSERT INTO space_comments (id, space_id, user_id, body) VALUES ($1, $2, $3, $4) RETURNING created_at`,
    [id, spaceId, userId, check.body],
  )
  return { ok: true as const, comment: { id, userId, body: check.body, createdAt: inserted.rows[0]!.created_at.toISOString() } }
}

/** Latest 50 comments, oldest first; with `since` only newer ones (clients drop repeats by id). */
export async function listComments(userId: string, spaceId: string, since: Date | null) {
  const blocked = await commentGate(userId, spaceId)
  if (blocked) return blocked
  const rows = await pool.query<{ id: string; user_id: string; username: string; body: string; created_at: Date }>(
    `SELECT * FROM (
       SELECT c.id, c.user_id, u.username, c.body, c.created_at
       FROM space_comments c JOIN users u ON u.id = c.user_id
       WHERE c.space_id = $1 AND ($2::timestamptz IS NULL OR c.created_at >= $2)
       ORDER BY c.created_at DESC LIMIT 50
     ) latest ORDER BY created_at ASC`,
    [spaceId, since],
  )
  return {
    ok: true as const,
    comments: rows.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      body: r.body,
      createdAt: r.created_at.toISOString(),
    })),
  }
}

// ---------------------------------------------------------------- admin

export async function listSpaceReports() {
  const found = await pool.query(
    `SELECT s.id, s.title, s.status, s.visibility, s.place_id, s.host_id, u.username AS host_username,
            (SELECT COUNT(*)::int FROM space_host_bans b WHERE b.user_id = s.host_id) > 0 AS host_banned,
            COUNT(r.id)::int AS report_count, MAX(r.created_at) AS last_report_at,
            (SELECT COALESCE(json_agg(x.reason), '[]'::json) FROM (
               SELECT reason FROM space_reports WHERE space_id = s.id ORDER BY created_at DESC LIMIT 5) x) AS reasons
     FROM space_reports r
     JOIN spaces s ON s.id = r.space_id
     JOIN users u ON u.id = s.host_id
     GROUP BY s.id, u.username
     ORDER BY (s.status = 'live') DESC, MAX(r.created_at) DESC
     LIMIT 100`,
  )
  return {
    ok: true as const,
    reports: found.rows.map((row) => ({
      spaceId: row.id as string,
      title: row.title as string,
      status: row.status as SpaceStatus,
      visibility: row.visibility as Visibility,
      placeId: row.place_id as string | null,
      host: { id: row.host_id as string, username: row.host_username as string },
      hostBanned: Boolean(row.host_banned),
      reportCount: row.report_count as number,
      lastReportAt: (row.last_report_at as Date).toISOString(),
      reasons: row.reasons as string[],
    })),
  }
}

export async function adminEndSpace(spaceId: string) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  const ended = await finishSpace(spaceId, 'admin_ended')
  return { ok: true as const, ended }
}

/** Bar the host of a Space from hosting, and end any room they have open. */
export async function adminBanHost(adminId: string, spaceId: string) {
  const space = await loadSpace(spaceId)
  if (!space) return fail(404, 'NOT_FOUND', 'That Space doesn’t exist.')
  if (space.host_id === adminId) return fail(400, 'SELF', 'You can’t ban yourself.')
  await pool.query(
    `INSERT INTO space_host_bans (user_id, reason, banned_by) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
    [space.host_id, `Reported Space ${spaceId}`, adminId],
  )
  const open = await pool.query<{ id: string }>(`SELECT id FROM spaces WHERE host_id = $1 AND status <> 'ended'`, [space.host_id])
  for (const room of open.rows) await finishSpace(room.id, 'admin_ended').catch((error) => log(`admin end ${room.id}`, error))
  return { ok: true as const, hostId: space.host_id }
}

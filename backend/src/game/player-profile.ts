import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { containsBlockedLanguage, defaultDisplayNameFromAccount, validateDisplayName } from './display-name.js'
import {
  AVATAR_COLORS,
  COURSE_ID_TO_DEPARTMENT,
  PROFILE_DEPARTMENTS,
  STUDY_LEVELS,
  type StudyLevel,
} from './profile-constants.js'
import { clampNeeds, defaultNeeds, type Needs } from './needs.js'

export type ProfileRow = {
  user_id: string
  display_name: string
  avatar_color: string
  avatar_emoji: string | null
  department: string
  study_level: StudyLevel
  bio: string
  updated_at: Date
}

export type PublicPlayerProfile = {
  userId: string
  username: string
  displayName: string
  avatar: { color: string; emoji: string | null }
  department: string
  studyLevel: StudyLevel
  bio: string
  joinDate: string
  stats: {
    daysPlayed: number
    reputation: number
    whotWins: number
  }
  isOwner: boolean
}

export type PrivatePlayerStats = {
  cash: number
  needs: Needs
}

export type PlayerProfileResponse = PublicPlayerProfile & {
  private?: PrivatePlayerStats
}

type UserRow = {
  id: string
  name: string
  username: string
  created_at: Date
}

type CharacterGameRow = {
  character_id: string
  course_id: string | null
  appearance: { skinTone?: string } | null
  cash: string | number | null
  needs: Needs | string | null
  game_time: number | null
  reputation: number | null
  whot_wins?: number | null
}

function parseNeeds(raw: Needs | string | null | undefined): Needs {
  if (!raw) return defaultNeeds()
  if (typeof raw === 'string') {
    try {
      return clampNeeds(JSON.parse(raw) as Partial<Needs>)
    } catch {
      return defaultNeeds()
    }
  }
  return clampNeeds(raw)
}

function asMoney(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function defaultAvatarColor(appearance: CharacterGameRow['appearance']): string {
  const tone = appearance?.skinTone
  if (typeof tone === 'string' && AVATAR_COLORS.includes(tone as (typeof AVATAR_COLORS)[number])) {
    return tone
  }
  return AVATAR_COLORS[0]
}

function defaultDepartment(courseId: string | null): string {
  if (courseId && COURSE_ID_TO_DEPARTMENT[courseId]) return COURSE_ID_TO_DEPARTMENT[courseId]
  return 'Undeclared'
}

export async function resolveProfileUserId(idParam: string): Promise<string | null> {
  const byId = await pool.query<{ id: string }>('SELECT id FROM users WHERE id = $1 LIMIT 1', [idParam])
  if (byId.rows[0]) return byId.rows[0].id
  const byUsername = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [idParam],
  )
  return byUsername.rows[0]?.id ?? null
}

export async function ensurePlayerProfile(
  client: PoolClient,
  user: UserRow,
  character?: { course_id: string | null; appearance: unknown } | null,
): Promise<ProfileRow> {
  const existing = await client.query<ProfileRow>(
    `SELECT user_id, display_name, avatar_color, avatar_emoji, department, study_level, bio, updated_at
     FROM player_profiles WHERE user_id = $1`,
    [user.id],
  )
  if (existing.rows[0]) return existing.rows[0]

  const appearance =
    character?.appearance && typeof character.appearance === 'object'
      ? (character.appearance as CharacterGameRow['appearance'])
      : null
  const displayName = defaultDisplayNameFromAccount(user.name, user.username)
  let uniqueName = displayName
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await client.query(
      'SELECT 1 FROM player_profiles WHERE LOWER(display_name) = LOWER($1) LIMIT 1',
      [uniqueName],
    )
    if ((clash.rowCount ?? 0) === 0) break
    uniqueName = `${user.username}`.slice(0, 20)
    const checked = validateDisplayName(uniqueName)
    if (!checked.ok) uniqueName = `Player ${user.username}`.slice(0, 20)
  }

  const department = defaultDepartment(character?.course_id ?? null)
  const avatarColor = defaultAvatarColor(appearance)

  const inserted = await client.query<ProfileRow>(
    `INSERT INTO player_profiles
       (user_id, display_name, avatar_color, department, study_level, bio)
     VALUES ($1, $2, $3, $4, '100L', '')
     RETURNING user_id, display_name, avatar_color, avatar_emoji, department, study_level, bio, updated_at`,
    [user.id, uniqueName, avatarColor, department],
  )
  return inserted.rows[0]!
}

async function loadUserBundle(userId: string): Promise<{
  user: UserRow
  profile: ProfileRow
  character: CharacterGameRow | null
} | null> {
  const client = await pool.connect()
  try {
    const userRes = await client.query<UserRow>(
      'SELECT id, name, username, created_at FROM users WHERE id = $1',
      [userId],
    )
    const user = userRes.rows[0]
    if (!user) return null

    const charRes = await client.query<{
      id: string
      course_id: string | null
      appearance: unknown
    }>('SELECT id, course_id, appearance FROM characters WHERE user_id = $1 LIMIT 1', [userId])
    const charRow = charRes.rows[0] ?? null

    const profile = await ensurePlayerProfile(client, user, charRow)

    let character: CharacterGameRow | null = null
    if (charRow) {
      const gs = await client.query<CharacterGameRow>(
        `SELECT gs.character_id, c.course_id, c.appearance, gs.cash, gs.needs, gs.game_time, gs.reputation, gs.whot_wins
         FROM characters c
         LEFT JOIN game_state gs ON gs.character_id = c.id
         WHERE c.id = $1`,
        [charRow.id],
      )
      character = gs.rows[0] ?? {
        character_id: charRow.id,
        course_id: charRow.course_id,
        appearance: charRow.appearance as CharacterGameRow['appearance'],
        cash: 0,
        needs: defaultNeeds(),
        game_time: 480,
        reputation: 0,
        whot_wins: 0,
      }
    }

    return { user, profile, character }
  } finally {
    client.release()
  }
}

function toPublic(
  user: UserRow,
  profile: ProfileRow,
  character: CharacterGameRow | null,
  viewerUserId: string | null,
): PlayerProfileResponse {
  const isOwner = viewerUserId === user.id
  // The clock is the real calendar for everyone, so "days in Ekpoma" counts from when they joined
  const day = Math.floor((Date.now() - user.created_at.getTime()) / 86_400_000) + 1
  const reputation =
    typeof character?.reputation === 'number' && Number.isFinite(character.reputation)
      ? character.reputation
      : 0
  const whotWins =
    typeof character?.whot_wins === 'number' && Number.isFinite(character.whot_wins) ? character.whot_wins : 0

  const base: PlayerProfileResponse = {
    userId: user.id,
    username: user.username,
    // Real name is private: only the owner sees it, everyone else sees the username
    displayName: isOwner ? profile.display_name : user.username,
    avatar: { color: profile.avatar_color, emoji: profile.avatar_emoji },
    department: profile.department,
    studyLevel: profile.study_level,
    bio: profile.bio,
    joinDate: user.created_at.toISOString(),
    stats: {
      daysPlayed: Math.max(1, day),
      reputation,
      whotWins,
    },
    isOwner,
  }

  if (!isOwner) return base

  return {
    ...base,
    private: {
      cash: asMoney(character?.cash),
      needs: parseNeeds(character?.needs),
    },
  }
}

export async function getPlayerProfile(
  targetUserId: string,
  viewerUserId: string | null,
): Promise<PlayerProfileResponse | null> {
  const bundle = await loadUserBundle(targetUserId)
  if (!bundle) return null
  return toPublic(bundle.user, bundle.profile, bundle.character, viewerUserId)
}

export type ProfilePatch = {
  displayName?: string
  avatarColor?: string
  avatarEmoji?: string | null
  department?: string
  studyLevel?: StudyLevel
  bio?: string
}

export async function patchPlayerProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<{ ok: true; profile: PlayerProfileResponse } | { ok: false; status: number; error: string }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userRes = await client.query<UserRow>(
      'SELECT id, name, username, created_at FROM users WHERE id = $1',
      [userId],
    )
    const user = userRes.rows[0]
    if (!user) {
      await client.query('ROLLBACK')
      return { ok: false, status: 404, error: 'Account not found.' }
    }

    const charRes = await client.query<{ course_id: string | null; appearance: unknown }>(
      'SELECT course_id, appearance FROM characters WHERE user_id = $1 LIMIT 1',
      [userId],
    )
    const existing = await ensurePlayerProfile(client, user, charRes.rows[0] ?? null)

    let displayName = existing.display_name
    if (patch.displayName !== undefined) {
      const checked = validateDisplayName(patch.displayName)
      if (!checked.ok) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: checked.error }
      }
      displayName = checked.name
      const clash = await client.query(
        `SELECT user_id FROM player_profiles
         WHERE LOWER(display_name) = LOWER($1) AND user_id <> $2 LIMIT 1`,
        [displayName, userId],
      )
      if ((clash.rowCount ?? 0) > 0) {
        await client.query('ROLLBACK')
        return { ok: false, status: 409, error: 'That display name is already taken.' }
      }
    }

    let avatarColor = existing.avatar_color
    if (patch.avatarColor !== undefined) {
      if (!AVATAR_COLORS.includes(patch.avatarColor as (typeof AVATAR_COLORS)[number])) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: 'Pick one of the profile colours.' }
      }
      avatarColor = patch.avatarColor
    }

    let avatarEmoji = existing.avatar_emoji
    if (patch.avatarEmoji !== undefined) {
      if (patch.avatarEmoji === null || patch.avatarEmoji === '') {
        avatarEmoji = null
      } else if (!/^\p{Extended_Pictographic}$/u.test(patch.avatarEmoji)) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: 'Choose a single emoji for your avatar.' }
      } else {
        avatarEmoji = patch.avatarEmoji
      }
    }

    let department = existing.department
    if (patch.department !== undefined) {
      const trimmed = patch.department.trim()
      if (trimmed.length < 2 || trimmed.length > 48) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: 'Department should be 2–48 characters.' }
      }
      if (!PROFILE_DEPARTMENTS.includes(trimmed as (typeof PROFILE_DEPARTMENTS)[number])) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: 'Pick a department from the list.' }
      }
      department = trimmed
    }

    let studyLevel = existing.study_level
    if (patch.studyLevel !== undefined) {
      if (!STUDY_LEVELS.includes(patch.studyLevel)) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: 'Level should be 100L through 500L.' }
      }
      studyLevel = patch.studyLevel
    }

    let bio = existing.bio
    if (patch.bio !== undefined) {
      const trimmed = patch.bio.trim()
      if (trimmed.length > 120) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: 'Bio can be 120 characters at most.' }
      }
      if (containsBlockedBio(trimmed)) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, error: 'Keep your bio positive and campus-friendly.' }
      }
      bio = trimmed
    }

    const updated = await client.query<ProfileRow>(
      `UPDATE player_profiles
       SET display_name = $2,
           avatar_color = $3,
           avatar_emoji = $4,
           department = $5,
           study_level = $6,
           bio = $7,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, display_name, avatar_color, avatar_emoji, department, study_level, bio, updated_at`,
      [userId, displayName, avatarColor, avatarEmoji, department, studyLevel, bio],
    )
    await client.query('COMMIT')

    const bundle = await loadUserBundle(userId)
    if (!bundle) return { ok: false, status: 500, error: 'Could not load profile.' }
    return {
      ok: true,
      profile: toPublic(bundle.user, updated.rows[0]!, bundle.character, userId),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function containsBlockedBio(text: string): boolean {
  if (!text) return false
  return containsBlockedLanguage(text)
}

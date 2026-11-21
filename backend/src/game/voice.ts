import { pool } from '../db.js'
import { type LiveKitConfig } from './livekit.js'

export type HouseVoice = 'open' | 'friends' | 'private'

export type VoicePerson = { userId: string; username: string; color: string; emoji: string | null }

/** Who may enter a house's voice room. Owner always; the rest by the owner's mode. Server-enforced. */
export async function houseVoiceAccess(ownerUserId: string, userId: string): Promise<{ ok: true; mode: HouseVoice } | { ok: false; mode: HouseVoice; error: string }> {
  const { rows } = await pool.query<{ house_voice: HouseVoice }>(`SELECT house_voice FROM characters WHERE user_id = $1 LIMIT 1`, [ownerUserId])
  const mode = rows[0]?.house_voice ?? 'open'
  if (ownerUserId === userId) return { ok: true, mode }
  const blocked = await pool.query(`SELECT 1 FROM player_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [ownerUserId, userId])
  if (blocked.rows.length) return { ok: false, mode, error: 'This house voice is private.' }
  if (mode === 'open') return { ok: true, mode }
  if (mode === 'friends') {
    const [a, b] = ownerUserId < userId ? [ownerUserId, userId] : [userId, ownerUserId]
    const f = await pool.query(`SELECT 1 FROM player_relations WHERE a_id = $1 AND b_id = $2 AND points > 0`, [a, b])
    if (f.rows.length) return { ok: true, mode }
    return { ok: false, mode, error: 'Voice here is for friends only.' }
  }
  const inv = await pool.query(`SELECT 1 FROM house_voice_invites WHERE owner_id = $1 AND user_id = $2`, [ownerUserId, userId])
  if (inv.rows.length) return { ok: true, mode }
  return { ok: false, mode, error: 'Voice here is private. Ask the owner to invite you.' }
}

/** Avatars for everyone connected to a room (identity is the user id). */
export async function peopleInRoom(cfg: LiveKitConfig, room: string): Promise<VoicePerson[]> {
  const { listRoomIdentities } = await import('./livekit-people.js')
  const ids = await listRoomIdentities(cfg, room)
  if (!ids.length) return []
  const { rows } = await pool.query<{ id: string; username: string; avatar_color: string | null; avatar_emoji: string | null }>(
    `SELECT u.id, u.username, p.avatar_color, p.avatar_emoji FROM users u LEFT JOIN player_profiles p ON p.user_id = u.id WHERE u.id = ANY($1::text[])`,
    [ids],
  )
  return rows.map((r) => ({ userId: r.id, username: r.username, color: r.avatar_color ?? '#3d9ad6', emoji: r.avatar_emoji }))
}

export const callRoom = (callId: string) => `call_${callId}`

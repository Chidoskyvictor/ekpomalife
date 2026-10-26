import type { PoolClient } from 'pg'
import { pool } from '../db.js'

/**
 * "No money moves while you're live": coin, naira and crypto transfers are refused for
 * anyone currently inside a live Space. Returns a player-facing error, or null when clear.
 */
export async function liveSpaceMoneyBlock(userIds: string[], db: Pick<PoolClient, 'query'> = pool): Promise<string | null> {
  const ids = userIds.filter(Boolean)
  if (ids.length === 0) return null
  const found = await db.query<{ user_id: string }>(
    `SELECT m.user_id FROM space_members m
     JOIN spaces s ON s.id = m.space_id
     WHERE m.user_id = ANY($1::text[]) AND m.left_at IS NULL AND s.status = 'live'
     LIMIT 1`,
    [ids],
  )
  const who = found.rows[0]?.user_id
  if (!who) return null
  return who === ids[0]
    ? 'You can’t move money while you’re in a live Space. Leave the Space first.'
    : 'They’re in a live Space right now. Money can’t move until they leave it.'
}

/** Same guard keyed by character id (club sprays and pickups only know characters). */
export async function liveSpaceMoneyBlockForCharacter(characterId: string, db: Pick<PoolClient, 'query'> = pool) {
  const found = await db.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [characterId])
  const userId = found.rows[0]?.user_id
  return userId ? liveSpaceMoneyBlock([userId], db) : null
}

/** Guard for several characters at once (bet pots between players). */
export async function liveSpaceMoneyBlockForCharacters(characterIds: (string | null)[], db: Pick<PoolClient, 'query'> = pool) {
  const ids = characterIds.filter((id): id is string => Boolean(id))
  if (ids.length === 0) return null
  const found = await db.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = ANY($1::text[])`, [ids])
  return liveSpaceMoneyBlock(found.rows.map((r) => r.user_id), db)
}

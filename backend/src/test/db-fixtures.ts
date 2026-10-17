import { hashPassword } from '../auth/password.js'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { defaultNeeds } from '../game/needs.js'

const APPEARANCE = {
  body: 'man',
  hair: 'lowcut',
  outfit: 'casual',
  skin: '#C68642',
  hairColor: '#0D0D0D',
  topColor: '#2B7FFF',
  bottomColor: '#22A85A',
}

export async function createTestUser(opts?: {
  complete?: boolean
  cash?: number
  traits?: string[]
}) {
  const complete = opts?.complete ?? true
  const cash = opts?.cash ?? 125_000
  const traits = opts?.traits ?? ['hustler', 'tech']
  const userId = createId()
  const characterId = createId()
  const username = `t_${userId.slice(0, 10).toLowerCase()}`
  const passwordHash = await hashPassword('test-pass-99')

  await pool.query(
    `INSERT INTO users (id, name, username, password_hash, email)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, 'Test Player', username, passwordHash, `${username}@test.local`],
  )

  if (complete) {
    await pool.query(
      `INSERT INTO characters (
         id, user_id, appearance, traits, dream_id, lodging_id, character_type,
         cash, starting_cash, starting_tier, cash_rolled_at, snapshot, badges
       ) VALUES (
         $1, $2, $3::jsonb, $4::text[], 'first-class', 'hostel-poultry', 'student',
         $5, $5, 'Steady Start', NOW(), '{}'::jsonb, '{}'::text[]
       )`,
      [characterId, userId, JSON.stringify(APPEARANCE), traits, cash],
    )
    await pool.query(
      `INSERT INTO game_state (character_id, cash, needs, location_id, game_time, version)
       VALUES ($1, $2, $3::jsonb, 'admin-block', 720, 1)`,
      [characterId, cash, JSON.stringify(defaultNeeds())],
    )
    await pool.query(
      `INSERT INTO ledger (id, character_id, amount, reason, kind, balance_after)
       VALUES ($1, $2, $3, 'starting-money', 'starting_money', $3)`,
      [createId(), characterId, cash],
    )
  } else {
    await pool.query(
      `INSERT INTO characters (id, user_id, appearance, traits, dream_id, snapshot, badges, cash)
       VALUES ($1, $2, $3::jsonb, $4::text[], NULL, '{}'::jsonb, '{}'::text[], 0)`,
      [characterId, userId, JSON.stringify(APPEARANCE), []],
    )
  }

  return { userId, characterId, username }
}

export async function cleanupTestUser(userId: string) {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId])
}

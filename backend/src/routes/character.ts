import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'
import { clampSnapshot, dreamProgress, getDream } from '../game/dreams.js'
import { createId } from '../ids.js'

const dreamBody = z.object({
  dreamId: z.enum([
    'first-class',
    'faculty-president',
    'ekpoma-landlord',
    'big-boy',
    'edo-star',
    'campus-celeb',
    'tech-founder',
  ]),
})

const checkBody = z.object({
  snapshot: z.unknown(),
})

async function loadCharacter(userId: string) {
  const found = await pool.query<{
    id: string
    dream_id: string | null
    snapshot: unknown
    badges: string[]
    dream_completed_at: Date | null
  }>('SELECT id, dream_id, snapshot, badges, dream_completed_at FROM characters WHERE user_id = $1', [userId])
  return found.rows[0] ?? null
}

export async function characterRoutes(app: FastifyInstance) {
  app.post('/character/dream', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to save your dream.' })

    const parsed = dreamBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.issues[0]?.message ?? 'Pick a big dream.' })
    }

    const existing = await loadCharacter(user.id)
    if (existing) {
      const sameDream = existing.dream_id === parsed.data.dreamId
      await pool.query(
        `UPDATE characters
         SET dream_id = $2,
             snapshot = CASE WHEN $3 THEN snapshot ELSE '{}'::jsonb END,
             dream_completed_at = CASE WHEN $3 THEN dream_completed_at ELSE NULL END,
             badges = CASE WHEN $3 THEN badges ELSE '{}'::text[] END,
             updated_at = NOW()
         WHERE user_id = $1`,
        [user.id, parsed.data.dreamId, sameDream],
      )
    } else {
      await pool.query(
        'INSERT INTO characters (id, user_id, dream_id, snapshot, badges) VALUES ($1, $2, $3, $4, $5)',
        [createId(), user.id, parsed.data.dreamId, JSON.stringify({}), []],
      )
    }

    return reply.send({ ok: true, dreamId: parsed.data.dreamId })
  })

  app.post('/character/dream/check', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to check your dream.' })

    const parsed = checkBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Send your current stats.' })

    let character = await loadCharacter(user.id)
    if (!character?.dream_id) {
      return reply.code(400).send({ ok: false, error: 'Pick a big dream first.' })
    }

    const dream = getDream(character.dream_id)
    if (!dream) return reply.code(400).send({ ok: false, error: 'That dream is no longer available.' })

    const snapshot = clampSnapshot(parsed.data.snapshot)
    const progress = dreamProgress(dream, snapshot)
    const alreadyCompleted = Boolean(character.dream_completed_at)
    const newlyCompleted = progress.complete && !alreadyCompleted

    if (newlyCompleted) {
      const badges = character.badges.includes(dream.reward.badge)
        ? character.badges
        : [...character.badges, dream.reward.badge]
      await pool.query(
        `UPDATE characters
         SET snapshot = $2::jsonb, badges = $3, dream_completed_at = NOW(), updated_at = NOW()
         WHERE user_id = $1`,
        [user.id, JSON.stringify(snapshot), badges],
      )
      character = { ...character, badges, dream_completed_at: new Date() }
    } else {
      await pool.query('UPDATE characters SET snapshot = $2::jsonb, updated_at = NOW() WHERE user_id = $1', [
        user.id,
        JSON.stringify(snapshot),
      ])
    }

    return reply.send({
      ok: true,
      progress,
      completed: progress.complete && Boolean(character.dream_completed_at),
      newlyCompleted,
      reward: newlyCompleted ? dream.reward : null,
      badges: character.badges,
    })
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'
import { clampSnapshot, dreamProgress, getDream, type DreamId } from '../game/dreams.js'
import { ensureGameState } from '../game/game-state.js'
import { startPlaceForLodging } from '../game/places.js'
import { checkAppearance, type Appearance } from '../game/look.js'
import { onboardingStep, type OnboardingStep } from '../game/onboarding.js'
import { setupBodySchema } from '../game/setup.js'
import {
  messageForTier,
  rangeForDream,
  rollStartingMoney,
  tierIdForAmount,
  tierNameFor,
} from '../game/starting-money.js'
import { checkTraits, type TraitId } from '../game/traits.js'
import { createId } from '../ids.js'

const dreamBody = z.object({
  dreamId: z.enum([
    'first-class',
    'ekpoma-landlord',
    'big-boy',
    'edo-star',
    'campus-celeb',
    'tech-founder',
    'politics',
  ]),
})

type CharacterRow = {
  id: string
  appearance: Appearance | null
  traits: string[]
  dream_id: string | null
  snapshot: unknown
  badges: string[]
  dream_completed_at: Date | null
  cash: string | number | null
  starting_cash: string | number | null
  starting_tier: string | null
  cash_rolled_at: Date | null
  character_type: string | null
  lodging_id: string | null
  course_id: string | null
}

function asMoney(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function asAppearance(value: unknown): Appearance | null {
  const checked = checkAppearance(value)
  return checked.ok ? checked.value : null
}

function asTraits(value: string[] | null | undefined): TraitId[] {
  const checked = checkTraits(value ?? [])
  return checked.ok ? checked.value : []
}

function payload(row: CharacterRow | null) {
  const appearance = row ? asAppearance(row.appearance) : null
  const traits = row ? asTraits(row.traits) : []
  const dreamId = row?.dream_id ?? null
  const lodgingId = row?.lodging_id ?? null
  const step: OnboardingStep = onboardingStep({
    appearance,
    traits,
    dreamId,
    lodgingId,
    cashRolled: Boolean(row?.cash_rolled_at),
  })
  return {
    ok: true as const,
    step,
    appearance,
    traits,
    dreamId,
    characterType: row?.character_type ?? null,
    lodgingId,
    courseId: row?.course_id ?? null,
    badges: row?.badges ?? [],
    cash: row ? asMoney(row.cash) : 0,
    startingCash: row?.starting_cash == null ? null : asMoney(row.starting_cash),
    startingTier: row?.starting_tier ?? null,
  }
}

async function loadCharacter(userId: string) {
  const found = await pool.query<CharacterRow>(
    `SELECT id, appearance, traits, dream_id, snapshot, badges, dream_completed_at,
            cash, starting_cash, starting_tier, cash_rolled_at,
            character_type, lodging_id, course_id
     FROM characters WHERE user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
}

async function ensureCharacter(userId: string) {
  const existing = await loadCharacter(userId)
  if (existing) return existing
  const id = createId()
  await pool.query('INSERT INTO characters (id, user_id, snapshot, badges, traits) VALUES ($1, $2, $3, $4, $5)', [
    id,
    userId,
    JSON.stringify({}),
    [],
    [],
  ])
  return loadCharacter(userId)
}

export async function characterRoutes(app: FastifyInstance) {
  app.get('/character', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to continue.' })
    return reply.send(payload(await loadCharacter(user.id)))
  })

  app.post('/character/look', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to save your look.' })

    const body = request.body && typeof request.body === 'object' ? (request.body as { appearance?: unknown }) : {}
    const checked = checkAppearance(body.appearance)
    if (!checked.ok) return reply.code(400).send({ ok: false, error: checked.error })

    await ensureCharacter(user.id)
    await pool.query('UPDATE characters SET appearance = $2::jsonb, updated_at = NOW() WHERE user_id = $1', [
      user.id,
      JSON.stringify(checked.value),
    ])
    return reply.send(payload(await loadCharacter(user.id)))
  })

  app.post('/character/traits', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to save your traits.' })

    const row = await loadCharacter(user.id)
    const appearance = row ? asAppearance(row.appearance) : null
    if (!appearance) {
      return reply.code(409).send({ ok: false, error: 'Finish your look first.', step: 'look' as OnboardingStep })
    }

    const body = request.body && typeof request.body === 'object' ? (request.body as { traits?: unknown }) : {}
    const checked = checkTraits(body.traits)
    if (!checked.ok) return reply.code(400).send({ ok: false, error: checked.error })

    await pool.query('UPDATE characters SET traits = $2, updated_at = NOW() WHERE user_id = $1', [
      user.id,
      checked.value,
    ])
    return reply.send(payload(await loadCharacter(user.id)))
  })

  app.post('/character/dream', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to save your dream.' })

    const parsed = dreamBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.issues[0]?.message ?? 'Pick a big dream.' })
    }

    const row = await loadCharacter(user.id)
    const appearance = row ? asAppearance(row.appearance) : null
    const traits = row ? asTraits(row.traits) : []
    if (!appearance) {
      return reply.code(409).send({ ok: false, error: 'Finish your look first.', step: 'look' as OnboardingStep })
    }
    if (traits.length !== 2) {
      return reply.code(409).send({ ok: false, error: 'Pick two traits first.', step: 'traits' as OnboardingStep })
    }

    const existing = row
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

    return reply.send(payload(await loadCharacter(user.id)))
  })

  app.post('/character/setup', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to save where you live.' })

    const parsed = setupBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Pick your lodging.',
      })
    }

    const row = await loadCharacter(user.id)
    const appearance = row ? asAppearance(row.appearance) : null
    const traits = row ? asTraits(row.traits) : []
    if (!appearance || traits.length !== 2 || !row?.dream_id) {
      return reply.code(409).send({
        ok: false,
        error: 'Finish look, traits, and dream first.',
        step: !appearance ? 'look' : traits.length !== 2 ? 'traits' : 'dream',
      })
    }

    const courseId = parsed.data.lodgingId === 'hostel-poultry' ? (parsed.data.courseId ?? null) : null
    await pool.query(
      `UPDATE characters
       SET character_type = $2, lodging_id = $3, course_id = $4, updated_at = NOW()
       WHERE user_id = $1`,
      [user.id, parsed.data.characterType, parsed.data.lodgingId, courseId],
    )
    return reply.send(payload(await loadCharacter(user.id)))
  })

  /** Progress from server snapshot + cash only — never trust client numbers. */
  app.post('/character/dream/check', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to check your dream.' })

    let character = await loadCharacter(user.id)
    const appearance = character ? asAppearance(character.appearance) : null
    const traits = character ? asTraits(character.traits) : []
    if (!appearance || traits.length !== 2 || !character?.dream_id) {
      return reply.code(400).send({ ok: false, error: 'Finish look, traits, and dream first.' })
    }

    const dream = getDream(character.dream_id)
    if (!dream) return reply.code(400).send({ ok: false, error: 'That dream is no longer available.' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const gs = await client.query<{ cash: string | number }>(
        `SELECT cash FROM game_state WHERE character_id = $1`,
        [character.id],
      )
      const cash = gs.rows[0] ? asMoney(gs.rows[0].cash) : asMoney(character.cash)
      const snapshot = clampSnapshot(character.snapshot)
      snapshot.netWorth = Math.max(snapshot.netWorth, cash)
      const progress = dreamProgress(dream, snapshot)
      const alreadyCompleted = Boolean(character.dream_completed_at)
      const newlyCompleted = progress.complete && !alreadyCompleted

      if (newlyCompleted) {
        const badges = character.badges.includes(dream.reward.badge)
          ? character.badges
          : [...character.badges, dream.reward.badge]
        await client.query(
          `UPDATE characters
           SET snapshot = $2::jsonb, badges = $3, dream_completed_at = NOW(), updated_at = NOW()
           WHERE user_id = $1`,
          [user.id, JSON.stringify(snapshot), badges],
        )
        character = { ...character, badges, dream_completed_at: new Date(), snapshot }
      } else {
        await client.query('UPDATE characters SET snapshot = $2::jsonb, updated_at = NOW() WHERE user_id = $1', [
          user.id,
          JSON.stringify(snapshot),
        ])
      }
      await client.query('COMMIT')

      return reply.send({
        ok: true,
        progress,
        completed: progress.complete && Boolean(character.dream_completed_at),
        newlyCompleted,
        reward: newlyCompleted ? dream.reward : null,
        badges: character.badges,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not check dream.' })
    } finally {
      client.release()
    }
  })

  app.post('/character/starting-money', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to spin your start.' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const found = await client.query<CharacterRow>(
        `SELECT id, appearance, traits, dream_id, snapshot, badges, dream_completed_at,
                cash, starting_cash, starting_tier, cash_rolled_at,
                character_type, lodging_id, course_id
         FROM characters WHERE user_id = $1 FOR UPDATE`,
        [user.id],
      )
      const row = found.rows[0]
      const appearance = row ? asAppearance(row.appearance) : null
      const traits = row ? asTraits(row.traits) : []
      const dreamId = row?.dream_id ?? null
      const range = dreamId ? rangeForDream(dreamId) : null

      if (!appearance || traits.length !== 2 || !dreamId || !range) {
        await client.query('ROLLBACK')
        return reply.code(409).send({
          ok: false,
          error: 'Finish look, traits, and dream first.',
          step: !appearance ? 'look' : traits.length !== 2 ? 'traits' : 'dream',
        })
      }

      if (!row.lodging_id) {
        await client.query('ROLLBACK')
        return reply.code(409).send({
          ok: false,
          error: 'Pick where you live first.',
          step: 'live' as OnboardingStep,
        })
      }

      const body = appearance.body === 'woman' ? 'woman' : 'man'

      if (row.cash_rolled_at && row.starting_cash != null) {
        const amount = asMoney(row.starting_cash)
        const stored = row.starting_tier
        const tierId = tierIdForAmount(amount)
        const tier = stored || tierNameFor(tierId, body)
        await ensureGameState(client, row.id, {
          cash: amount,
          lodgingId: row.lodging_id,
          reason: 'starting-money',
        })
        await client.query('COMMIT')
        return reply.send({
          ok: true,
          amount,
          tier,
          range,
          message: messageForTier(tierId, body),
        })
      }

      const rolled = rollStartingMoney({
        dreamId: dreamId as DreamId,
        traits,
        body,
      })

      await client.query(
        `UPDATE characters
         SET cash = $2,
             starting_cash = $2,
             starting_tier = $3,
             cash_rolled_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1`,
        [user.id, rolled.amount, rolled.tier],
      )
      await ensureGameState(client, row.id, {
        cash: rolled.amount,
        lodgingId: row.lodging_id,
        reason: 'starting-money',
      })
      /** If game_state was created early with 0, overwrite with the roll + ledger. */
      await client.query(
        `UPDATE game_state
         SET cash = $2, location_id = COALESCE(location_id, $3), updated_at = NOW()
         WHERE character_id = $1 AND cash = 0 AND version = 1`,
        [row.id, rolled.amount, startPlaceForLodging(row.lodging_id)],
      )
      const ledgerCheck = await client.query(
        `SELECT 1 FROM ledger WHERE character_id = $1 AND reason = 'starting-money' LIMIT 1`,
        [row.id],
      )
      if ((ledgerCheck.rowCount ?? 0) === 0) {
        await client.query(
          `INSERT INTO ledger (id, character_id, amount, reason, kind, balance_after)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [createId(), row.id, rolled.amount, 'starting-money', 'starting_money', rolled.amount],
        )
      }
      await client.query('COMMIT')
      return reply.send({
        ok: true,
        amount: rolled.amount,
        tier: rolled.tier,
        range: rolled.range,
        message: rolled.message,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not roll starting money.' })
    } finally {
      client.release()
    }
  })
}

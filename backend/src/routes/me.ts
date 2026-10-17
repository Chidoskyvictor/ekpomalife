import type { FastifyInstance } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { SESSION_COOKIE } from '../auth/session.js'
import { pool } from '../db.js'
import { computeSetupStatus, type SetupStep } from '../game/setup-status.js'

type CharacterRow = {
  id: string
  appearance: unknown
  traits: string[]
  dream_id: string | null
  lodging_id: string | null
}

/**
 * Session probe for the client redirect helper.
 * setupComplete requires look + traits + dream and a game_state row.
 */
export async function meRoutes(app: FastifyInstance) {
  app.get('/auth/me', async (request, reply) => {
    const cookieArrived = Boolean(request.cookies[SESSION_COOKIE])
    const user = await getSessionUser(request)
    if (process.env.NODE_ENV !== 'production') {
      request.log.info(
        {
          cookieArrived,
          sessionFound: Boolean(user),
          cookieHeaderPresent: Boolean(request.headers.cookie),
        },
        'GET /auth/me session probe',
      )
    }
    if (!user) {
      return reply.code(401).send({ ok: false, error: 'Not logged in.' })
    }

    const found = await pool.query<CharacterRow>(
      `SELECT id, appearance, traits, dream_id, lodging_id
       FROM characters WHERE user_id = $1`,
      [user.id],
    )
    const row = found.rows[0] ?? null

    let hasGameState = false
    if (row) {
      const gs = await pool.query<{ ok: number }>(
        `SELECT 1 AS ok FROM game_state WHERE character_id = $1 LIMIT 1`,
        [row.id],
      )
      hasGameState = Boolean(gs.rows[0])
    }

    const setup = computeSetupStatus({
      appearance: row?.appearance ?? null,
      traits: row?.traits ?? [],
      dreamId: row?.dream_id ?? null,
      lodgingId: row?.lodging_id ?? null,
      hasGameState,
    })

    return reply.send({
      ok: true,
      account: { name: user.name, username: user.username },
      setupComplete: setup.setupComplete,
      setupStep: setup.setupStep as SetupStep,
    })
  })
}

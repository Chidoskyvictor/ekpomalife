import type { FastifyInstance } from 'fastify'
import { hashPassword } from '../auth/password.js'
import { signupSchema } from '../auth/schema.js'
import { createSession, setSessionCookie } from '../auth/session.js'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { authIdentityRateLimit, authIpRateLimit } from '../rate-limit.js'

function firstZodError(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? 'Check the form and try again.'
}

export async function signupRoutes(app: FastifyInstance) {
  app.post(
    '/auth/signup',
    {
      config: { rateLimit: authIpRateLimit },
      preHandler: authIdentityRateLimit(app, 'email'),
    },
    async (request, reply) => {
      const parsed = signupSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: firstZodError(parsed.error) })
      }

      const { name, username, password, email, dateOfBirth } = parsed.data
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username])
      if ((existing.rowCount ?? 0) > 0) {
        return reply.code(409).send({ ok: false, error: 'That username is taken.' })
      }

      const passwordHash = await hashPassword(password)
      const user = { id: createId(), name, username }
      const dob = dateOfBirth && dateOfBirth.length > 0 ? dateOfBirth : null

      try {
        await pool.query(
          'INSERT INTO users (id, name, username, password_hash, email, date_of_birth) VALUES ($1, $2, $3, $4, $5, $6)',
          [user.id, user.name, user.username, passwordHash, email, dob],
        )
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? error.code : null
        if (code === '23505') {
          return reply.code(409).send({ ok: false, error: 'That username is taken.' })
        }
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Could not create the account. Try again.' })
      }

      const session = await createSession(user.id)
      setSessionCookie(reply, session.token, session.expiresAt)
      return reply.code(201).send({ ok: true, account: { name: user.name, username: user.username } })
    },
  )
}

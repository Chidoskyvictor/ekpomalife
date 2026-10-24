import type { FastifyInstance } from 'fastify'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { loginSchema } from '../auth/schema.js'
import { createSession, setSessionCookie } from '../auth/session.js'
import { pool } from '../db.js'
import { authIdentityRateLimit, authIpRateLimit } from '../rate-limit.js'

const INVALID = 'Wrong username or password.'

let dummyHash: string | null = null

async function unusedPasswordHash() {
  dummyHash ??= await hashPassword('not-a-real-password')
  return dummyHash
}

export async function loginRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    {
      config: { rateLimit: authIpRateLimit },
      preHandler: authIdentityRateLimit(app, 'username'),
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(401).send({ ok: false, error: INVALID })
      }

      const { username, password } = parsed.data
      const found = await pool.query<{ id: string; name: string; username: string; password_hash: string }>(
        'SELECT id, name, username, password_hash FROM users WHERE username = $1',
        [username],
      )
      const user = found.rows[0]
      const matches = await verifyPassword(user?.password_hash ?? (await unusedPasswordHash()), password)

      if (!user || !matches) {
        return reply.code(401).send({ ok: false, error: INVALID })
      }

      const session = await createSession(user.id)
      setSessionCookie(reply, session.token, session.expiresAt)
      return reply.send({ ok: true, account: { name: user.name, username: user.username } })
    },
  )
}

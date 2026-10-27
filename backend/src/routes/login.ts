import type { FastifyInstance } from 'fastify'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { loginSchema } from '../auth/schema.js'
import { createSession, setSessionCookie } from '../auth/session.js'
import { pool } from '../db.js'
import { authIdentityRateLimit, authIpRateLimit } from '../rate-limit.js'

const INVALID = 'Wrong username, email or password.'

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

      // The handle, or the email used at signup (emails are not unique, so every account on it is tried)
      const { username: identifier, password } = parsed.data
      const byEmail = identifier.includes('@')
      const found = await pool.query<{ id: string; name: string; username: string; password_hash: string }>(
        byEmail
          ? 'SELECT id, name, username, password_hash FROM users WHERE LOWER(email) = $1 ORDER BY created_at LIMIT 5'
          : 'SELECT id, name, username, password_hash FROM users WHERE username = $1',
        [identifier],
      )
      let user: (typeof found.rows)[number] | undefined
      for (const row of found.rows) {
        if (await verifyPassword(row.password_hash, password)) {
          user = row
          break
        }
      }
      // Same work for an unknown login, so timing doesn't reveal which accounts exist
      if (found.rows.length === 0) await verifyPassword(await unusedPasswordHash(), password)

      if (!user) {
        return reply.code(401).send({ ok: false, error: INVALID })
      }

      const session = await createSession(user.id)
      setSessionCookie(reply, session.token, session.expiresAt)
      return reply.send({ ok: true, account: { name: user.name, username: user.username } })
    },
  )
}

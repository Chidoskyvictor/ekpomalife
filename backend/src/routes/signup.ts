import type { FastifyInstance } from 'fastify'
import { hashPassword } from '../auth/password.js'
import { signupSchema } from '../auth/schema.js'
import { createSession, setSessionCookie } from '../auth/session.js'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { authIdentityRateLimit, authStrictIpRateLimit } from '../rate-limit.js'

/** One message for "email already used" so signup never confirms which emails have accounts. */
export const SIGNUP_FAILED = 'Could not create the account. Check your details, or sign in if you already have one.'
const USERNAME_TAKEN = 'That username is taken.'

function firstZodError(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? 'Check the form and try again.'
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function pgError(error: unknown) {
  if (typeof error !== 'object' || !error) return { code: null, constraint: null }
  const e = error as { code?: unknown; constraint?: unknown }
  return {
    code: typeof e.code === 'string' ? e.code : null,
    constraint: typeof e.constraint === 'string' ? e.constraint : null,
  }
}

export async function signupRoutes(app: FastifyInstance) {
  app.post(
    '/auth/signup',
    {
      config: { rateLimit: authStrictIpRateLimit },
      preHandler: authIdentityRateLimit(app, 'email'),
    },
    async (request, reply) => {
      const parsed = signupSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: firstZodError(parsed.error) })
      }

      const { name, username, password, dateOfBirth } = parsed.data
      const email = normalizeEmail(parsed.data.email)

      const existing = await pool.query<{ username_taken: boolean; email_taken: boolean }>(
        `SELECT
           EXISTS (SELECT 1 FROM users WHERE username = $1) AS username_taken,
           EXISTS (SELECT 1 FROM users WHERE LOWER(email) = $2) AS email_taken`,
        [username, email],
      )
      if (existing.rows[0]?.username_taken) {
        return reply.code(409).send({ ok: false, error: USERNAME_TAKEN })
      }

      // Hash before the email check so a used email costs the same time as a real signup.
      const passwordHash = await hashPassword(password)
      if (existing.rows[0]?.email_taken) {
        return reply.code(409).send({ ok: false, error: SIGNUP_FAILED })
      }

      const user = { id: createId(), name, username }
      const dob = dateOfBirth && dateOfBirth.length > 0 ? dateOfBirth : null

      try {
        await pool.query(
          'INSERT INTO users (id, name, username, password_hash, email, date_of_birth) VALUES ($1, $2, $3, $4, $5, $6)',
          [user.id, user.name, user.username, passwordHash, email, dob],
        )
      } catch (error) {
        const { code, constraint } = pgError(error)
        if (code === '23505') {
          // Race with another signup: users_email_lower_unique, or the username unique key.
          const usernameClash = constraint !== null && constraint.includes('username')
          return reply.code(409).send({ ok: false, error: usernameClash ? USERNAME_TAKEN : SIGNUP_FAILED })
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

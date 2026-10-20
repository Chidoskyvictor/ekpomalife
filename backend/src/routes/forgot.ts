import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { MIN_PASSWORD_LENGTH, hashPassword } from '../auth/password.js'
import { createResetCode, hashResetCode, resetExpiry } from '../auth/reset-code.js'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { env } from '../env.js'
import { buildResetEmail } from '../mail/reset-email.js'
import { sendMail } from '../mail/send.js'

const forgotSchema = z.object({
  email: z.string().trim().email().max(120),
})

const resetSchema = z.object({
  email: z.string().trim().email().max(120),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(72, 'Password is too long.'),
})

function firstZodError(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? 'Check the form and try again.'
}

const OK = { ok: true as const }

export async function forgotRoutes(app: FastifyInstance) {
  app.post(
    '/auth/forgot',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const parsed = forgotSchema.safeParse(request.body)
      if (!parsed.success) {
        // Still no email leak — bad input can return an error, unknown email cannot.
        return reply.code(400).send({ ok: false, error: firstZodError(parsed.error) })
      }

      const email = parsed.data.email.trim().toLowerCase()

      const recent = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
         WHERE LOWER(u.email) = $1
           AND pr.created_at > NOW() - INTERVAL '15 minutes'`,
        [email],
      )
      if ((recent.rows[0]?.count ?? 0) >= 5) {
        return reply.send(OK)
      }

      const found = await pool.query<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM users WHERE email IS NOT NULL AND LOWER(email) = $1 LIMIT 1`,
        [email],
      )
      const user = found.rows[0]
      if (!user) {
        return reply.code(404).send({
          ok: false,
          code: 'NO_ACCOUNT',
          error: "We couldn't find an account with that email.",
        })
      }

      const code = createResetCode()
      const codeHash = hashResetCode(code, user.id)
      const expiresAt = resetExpiry()

      await pool.query(
        `UPDATE password_resets
         SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [user.id],
      )
      await pool.query(
        `INSERT INTO password_resets (id, user_id, code_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [createId(), user.id, codeHash, expiresAt],
      )

      try {
        const mail = buildResetEmail({ name: user.name, code, appUrl: env.FRONTEND_ORIGIN })
        await sendMail({
          to: user.email,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        })
      } catch (error) {
        request.log.error(error)
        // Still return ok so attackers cannot probe delivery.
      }

      return reply.send(OK)
    },
  )

  app.post(
    '/auth/reset',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const parsed = resetSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: firstZodError(parsed.error) })
      }

      const email = parsed.data.email.trim().toLowerCase()
      const { code, password } = parsed.data

      const found = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE email IS NOT NULL AND LOWER(email) = $1 LIMIT 1`,
        [email],
      )
      const user = found.rows[0]
      if (!user) {
        return reply.code(400).send({ ok: false, error: 'Invalid or expired code.' })
      }

      const reset = await pool.query<{ id: string; code_hash: string }>(
        `SELECT id, code_hash
         FROM password_resets
         WHERE user_id = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id],
      )
      const row = reset.rows[0]
      if (!row || row.code_hash !== hashResetCode(code, user.id)) {
        return reply.code(400).send({ ok: false, error: 'Invalid or expired code.' })
      }

      const passwordHash = await hashPassword(password)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, passwordHash])
        await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [row.id])
        await client.query(
          `UPDATE password_resets
           SET used_at = NOW()
           WHERE user_id = $1 AND used_at IS NULL`,
          [user.id],
        )
        await client.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Could not reset the password. Try again.' })
      } finally {
        client.release()
      }

      return reply.send(OK)
    },
  )
}

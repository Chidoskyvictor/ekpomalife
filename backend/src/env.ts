import { config } from 'dotenv'
import { z } from 'zod'

config()

const emptyToUndefined = (value: unknown) => (value == null || value === '' ? undefined : value)

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.preprocess((value) => (value == null || value === '' ? 4000 : value), z.coerce.number().int().positive()),
  /** Comma-separated allowed browser origins (e.g. localhost + LAN IP + production URL). */
  FRONTEND_ORIGIN: z.preprocess(
    (value) => (value == null || value === '' ? 'http://localhost:3000' : value),
    z.string().min(1),
  ),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MAIL_FROM: z.preprocess(
    (value) => (value == null || value === '' ? 'Ekpoma Life <onboarding@resend.dev>' : value),
    z.string().min(3),
  ),
  RESET_CODE_PEPPER: z.preprocess(
    (value) => (value == null || value === '' ? 'ekpoma-dev-reset-pepper' : value),
    z.string().min(8),
  ),
})

export const env = envSchema.parse(process.env)

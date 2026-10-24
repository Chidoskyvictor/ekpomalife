import { config } from 'dotenv'
import { resolve } from 'node:path'
import { z } from 'zod'

// Repo root `.env` from `neon env pull`; `backend/.env` overrides for local overrides.
const repoRoot = resolve(import.meta.dirname, '../..')
config({ path: resolve(repoRoot, '.env') })
config({ path: resolve(import.meta.dirname, '../.env') })

const emptyToUndefined = (value: unknown) => (value == null || value === '' ? undefined : value)
const isProd = process.env.NODE_ENV === 'production'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional().default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Direct (non-pooler) URL — use for migrations; Neon sets this via `neon env pull`. */
  DATABASE_URL_UNPOOLED: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  PORT: z.preprocess((value) => (value == null || value === '' ? 4000 : value), z.coerce.number().int().positive()),
  /**
   * Comma-separated browser origins allowed for CORS + cookies.
   * Production default: ekpomalife.app (+ www).
   */
  FRONTEND_ORIGIN: z.preprocess((value) => {
    if (value == null || value === '') {
      return isProd
        ? 'https://ekpomalife.app,https://www.ekpomalife.app'
        : 'http://localhost:3000'
    }
    return value
  }, z.string().min(1)),
  /**
   * Peppers session token hashes. Required in production.
   * Generate with: openssl rand -hex 32
   */
  SESSION_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  /** Legacy flag — session cookies follow NODE_ENV (see auth/session.ts). */
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
  /** Phase 4 room visits. Off by default — GET /room/:username only for self. */
  ROOM_VISITS_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  /** Comma-separated IPs that skip rate limits (load testing). Empty by default. */
  RATE_LIMIT_ALLOWLIST: z.preprocess(emptyToUndefined, z.string().optional()),
  PHONE_FREE_FOR_ALL: z.preprocess((value) => value !== 'false' && value !== '0', z.boolean()),
})

export const env = envSchema.parse(process.env)

if (env.NODE_ENV === 'production' && !env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required when NODE_ENV=production (openssl rand -hex 32)')
}

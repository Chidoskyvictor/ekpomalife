import { config } from 'dotenv'
import { z } from 'zod'

config()

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.preprocess((value) => (value == null || value === '' ? 4000 : value), z.coerce.number().int().positive()),
  FRONTEND_ORIGIN: z.preprocess(
    (value) => (value == null || value === '' ? 'http://localhost:3000' : value),
    z.string().url(),
  ),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export const env = envSchema.parse(process.env)

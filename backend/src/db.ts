import pg from 'pg'
import { env } from './env.js'

export function createPool(connectionString: string, max = 10) {
  const wantsSsl =
    env.NODE_ENV === 'production' ||
    /sslmode=require/i.test(connectionString) ||
    process.env.PGSSL === 'true'

  return new pg.Pool({
    connectionString,
    max,
    ssl: wantsSsl ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  })
}

/** Pooled URL for app traffic (Neon `-pooler` host when using `neon env pull`). */
export const pool = createPool(env.DATABASE_URL)

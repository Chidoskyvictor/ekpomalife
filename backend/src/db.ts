import pg from 'pg'
import { env } from './env.js'

export function createPool(connectionString: string, max = 10) {
  const wantsSsl =
    env.NODE_ENV === 'production' ||
    /sslmode=require/i.test(connectionString) ||
    process.env.PGSSL === 'true'

  const pool = new pg.Pool({
    connectionString,
    max,
    // Neon scale-to-zero + multi-address DNS can exceed the default ~10s on Windows dev.
    connectionTimeoutMillis: 30_000,
    ssl: wantsSsl ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  })
  // An idle client dropped by the server (e.g. Neon ECONNRESET) emits 'error' on the pool; without a
  // listener Node crashes the whole API. pg discards that client and opens a fresh one next time.
  pool.on('error', (error) => {
    console.error('Postgres idle client error (client discarded):', error.message)
  })
  return pool
}

/** Pooled URL for app traffic (Neon `-pooler` host when using `neon env pull`). */
export const pool = createPool(env.DATABASE_URL)

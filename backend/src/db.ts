import pg from 'pg'
import { env } from './env.js'

const url = env.DATABASE_URL
const wantsSsl =
  env.NODE_ENV === 'production' ||
  /sslmode=require/i.test(url) ||
  process.env.PGSSL === 'true'

export const pool = new pg.Pool({
  connectionString: url,
  max: 10,
  ssl: wantsSsl ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
})

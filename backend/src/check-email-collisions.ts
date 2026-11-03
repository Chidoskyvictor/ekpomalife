/**
 * Read-only: lists accounts whose emails clash once trimmed + lowercased.
 * Run before migration 036: npm run db:check-emails. Exits 1 when clashes exist.
 */
import { createPool } from './db.js'
import { env } from './env.js'

const pool = createPool(env.DATABASE_URL, 1)
const client = await pool.connect()
try {
  await client.query('BEGIN READ ONLY')
  const { rows } = await client.query<{ email_key: string; accounts: { id: string; username: string; email: string; created_at: string }[] }>(
    `SELECT LOWER(TRIM(email)) AS email_key,
            json_agg(json_build_object('id', id, 'username', username, 'email', email, 'created_at', created_at)
                     ORDER BY created_at) AS accounts
     FROM users
     WHERE email IS NOT NULL
     GROUP BY LOWER(TRIM(email))
     HAVING COUNT(*) > 1
     ORDER BY email_key`,
  )
  await client.query('ROLLBACK')
  if (rows.length === 0) {
    console.log('No email collisions. Migration 036 can run.')
  } else {
    console.log(`${rows.length} email(s) shared by more than one account — migration 036 will stop:`)
    for (const row of rows) {
      console.log(`\n${row.email_key}`)
      for (const a of row.accounts) console.log(`  ${a.username}  id=${a.id}  email=${JSON.stringify(a.email)}  created=${a.created_at}`)
    }
    process.exitCode = 1
  }
} finally {
  client.release()
  await pool.end()
}

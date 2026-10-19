import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createPool } from './db.js'
import { env } from './env.js'

/**
 * Apply every backend/sql/*.sql file in sorted order.
 * Tracks applied files in schema_migrations so re-runs are safe.
 */
export async function runMigrations(): Promise<void> {
  const migrationUrl = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL
  const pool = createPool(migrationUrl, 1)

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const dir = resolve(import.meta.dirname, '../sql')
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()

    for (const file of files) {
      const already = await pool.query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [file])
      if ((already.rowCount ?? 0) > 0) {
        console.log(`Skip ${file} (already applied)`)
        continue
      }

      const sql = await readFile(resolve(dir, file), 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file])
        await client.query('COMMIT')
        console.log(`Applied ${file}`)
      } catch (error) {
        await client.query('ROLLBACK')
        console.error(`Failed ${file}`)
        throw error
      } finally {
        client.release()
      }
    }
  } finally {
    await pool.end()
  }
}

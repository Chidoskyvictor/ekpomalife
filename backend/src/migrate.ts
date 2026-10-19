import { pool } from './db.js'
import { runMigrations } from './migrations.js'

await runMigrations()
await pool.end()
console.log('Database tables are ready.')

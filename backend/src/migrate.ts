import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pool } from './db.js'

const dir = resolve(import.meta.dirname, '../sql')
const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
for (const file of files) {
  const sql = await readFile(resolve(dir, file), 'utf8')
  await pool.query(sql)
  console.log(`Applied ${file}`)
}
await pool.end()
console.log('Database tables are ready.')

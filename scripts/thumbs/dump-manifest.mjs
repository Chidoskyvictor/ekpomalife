// Writes thumbs.manifest.json (id, model, height, wall, first finish) from home_furniture in the database at
// DATABASE_URL_UNPOOLED of the first .env found up the tree (local dev = Neon branch "dev").
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
let dir = join(here, '..', '..')
let envFile
for (;;) {
  const p = join(dir, '.env')
  if (existsSync(p)) {
    envFile = p
    break
  }
  const up = dirname(dir)
  if (up === dir) throw new Error('.env not found')
  dir = up
}
const url = readFileSync(envFile, 'utf8').match(/^DATABASE_URL_UNPOOLED=["']?([^"'\n]+)/m)[1]
const { Client } = createRequire(join(dir, 'backend', 'package.json'))('pg')
const c = new Client({ connectionString: url })
await c.connect()
const { rows } = await c.query('SELECT id, model, height, wall, finishes FROM home_furniture WHERE model IS NOT NULL ORDER BY sort, id')
await c.end()
// Thumbnails show each piece in its own ("Original") colours, which is what you get when you place it
const list = rows.map((r) => ({ id: r.id, model: r.model, height: Number(r.height), wall: r.wall, finish: null }))
// Models that are not in the catalogue yet (naija/) get a thumbnail too, so they are ready when they are
const have = new Set(list.map((r) => r.model))
const wallPieces = ['wall-clock', 'ceiling-fan']
for (const f of readdirSync(join(here, '..', '..', 'public', 'models', 'furniture', 'naija'))) {
  if (!f.endsWith('.glb')) continue
  const model = `/models/furniture/naija/${f}`
  if (!have.has(model)) list.push({ id: `naija:${f.slice(0, -4)}`, model, height: 0, wall: wallPieces.includes(f.slice(0, -4)), finish: null })
}
writeFileSync(join(here, 'thumbs.manifest.json'), JSON.stringify(list, null, 1))
console.log(list.length, 'items')

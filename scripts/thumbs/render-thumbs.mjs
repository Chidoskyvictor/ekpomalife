/**
 * Catalogue thumbnails: renders every furniture GLB in a consistent studio (3/4 view, ~80% fill,
 * soft key + fill light, soft contact shadow, transparent background) with headless Chrome and
 * saves 320px webp files to public/models/furniture/thumbs/<name>.webp. <name> is the model path
 * under /models/furniture/ without ".glb", with "/" turned into "__" (see ItemPic in
 * components/room/buy-panel.tsx).
 *
 *   node scripts/thumbs/render-thumbs.mjs                # every model in thumbs.manifest.json
 *   node scripts/thumbs/render-thumbs.mjs vono k-sofa    # only models/ids containing one of the words
 *
 * thumbs.manifest.json comes from `node scripts/thumbs/dump-manifest.mjs` (reads home_furniture).
 * Needs Google Chrome installed (Playwright channel "chrome") and `sharp`.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const out = join(repo, 'public', 'models', 'furniture', 'thumbs')
const manifest = JSON.parse(readFileSync(join(here, 'thumbs.manifest.json'), 'utf8'))
const only = process.argv.slice(2)

function findUp(rel) {
  let dir = repo
  for (;;) {
    const p = join(dir, rel)
    if (existsSync(p)) return p
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`${rel} not found; run npm install`)
    dir = parent
  }
}
const nodeModules = dirname(dirname(findUp('node_modules/three/package.json'))) // the node_modules folder
const req = createRequire(join(dirname(nodeModules), 'package.json'))
const { chromium } = req('playwright')
const sharp = req('sharp')
const threeDir = nodeModules

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' }
const server = createServer((req2, res) => {
  const url = decodeURIComponent(req2.url.split('?')[0])
  let file
  if (url === '/') file = join(here, 'studio.html')
  else if (url.startsWith('/three/')) file = join(threeDir, url.slice(1))
  else file = join(repo, 'public', url)
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 640, height: 640 } })
page.on('pageerror', (e) => console.error('page error', e.message))
await page.goto(`http://127.0.0.1:${port}/`)
await page.waitForFunction(() => window.studioReady)

// One thumb per model file: the first catalogue row that uses it decides height (and shows its first finish, if any)
const seen = new Set()
let n = 0
for (const it of manifest) {
  const model = it.model
  if (seen.has(model)) continue
  if (only.length && !only.some((w) => model.includes(w) || it.id.includes(w))) continue
  seen.add(model)
  let data
  try {
    data = await page.evaluate((a) => window.renderItem(a), { model, finish: it.finish ?? null, height: it.height, wall: !!it.wall })
  } catch (e) {
    console.error('FAILED', model, String(e.message).slice(0, 120))
    continue
  }
  const png = Buffer.from(data.split(',')[1], 'base64')
  const name = model.replace(/^\/models\/furniture\//, '').replace(/\.glb$/, '').replace(/\//g, '__')
  const buf = await sharp(png).resize(320, 320).webp({ quality: 82, alphaQuality: 90 }).toBuffer()
  writeFileSync(join(out, `${name}.webp`), buf)
  n += 1
  console.log(`${name}.webp ${(buf.length / 1024).toFixed(1)} KB`)
}
await browser.close()
server.close()
console.log(`${n} thumbnails in ${out}`)

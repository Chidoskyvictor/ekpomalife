/**
 * Compress any GLB in public/models larger than LIMIT_MB with meshopt
 * via @gltf-transform/cli. Safe to re-run (skips files already under the limit).
 *
 *   node scripts/compress-models.mjs
 *   node scripts/compress-models.mjs --limit=20
 *   node scripts/compress-models.mjs --limit=0 --geometry-only
 *
 * --geometry-only: meshopt geometry compression only. Textures, mesh detail and
 * texture size are left exactly as they are (no WebP, no simplify, no resize).
 * Files that don't get smaller are kept as they were.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'models')
const limitMb = Number(
  (process.argv.find((a) => a.startsWith('--limit=')) || '--limit=20').split('=')[1],
)
const limitBytes = limitMb * 1024 * 1024
const geometryOnly = process.argv.includes('--geometry-only')

function walk(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) walk(full, out)
    else if (name.name.toLowerCase().endsWith('.glb')) out.push(full)
  }
  return out
}

if (!existsSync(root)) {
  console.error('public/models not found')
  process.exit(1)
}

const oversized = walk(root).filter((file) => statSync(file).size > limitBytes)
if (oversized.length === 0) {
  console.log(`All GLBs are under ${limitMb} MB. Nothing to compress.`)
  process.exit(0)
}

// Walk up from the repo so this also works from a git worktree that shares the main node_modules
function findCli() {
  let dir = fileURLToPath(new URL('..', import.meta.url))
  for (;;) {
    const candidate = join(dir, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) throw new Error('@gltf-transform/cli not found; run npm install')
    dir = parent
  }
}
const cli = findCli()

function lastLine(text) {
  const lines = String(text ?? '').trim().split('\n')
  return lines[lines.length - 1].trim()
}

let saved = 0
for (const file of oversized) {
  const before = statSync(file).size
  const tmp = `${file}.meshopt.glb`
  console.log(`Compressing ${relative(process.cwd(), file)} (${(before / 1024 / 1024).toFixed(2)} MB)…`)
  const args = geometryOnly
    ? [cli, 'meshopt', file, tmp, '--level', 'medium']
    : [cli, 'optimize', file, tmp, '--compress', 'meshopt', '--texture-compress', 'webp']
  try {
    execFileSync(process.execPath, args, { stdio: geometryOnly ? 'pipe' : 'inherit' })
  } catch (error) {
    console.error(`  FAILED, left unchanged: ${lastLine(error.stderr) || error.message}`)
    if (existsSync(tmp)) unlinkSync(tmp)
    continue
  }
  const after = statSync(tmp).size
  if (geometryOnly && after >= before) {
    unlinkSync(tmp)
    console.log('  → no gain, kept original')
    continue
  }
  unlinkSync(file)
  renameSync(tmp, file)
  saved += before - after
  console.log(
    `  → ${(after / 1024 / 1024).toFixed(2)} MB (${Math.round((1 - after / before) * 100)}% smaller)`,
  )
  if (after > 25 * 1024 * 1024) {
    console.error(`  WARNING: still over Cloudflare's 25 MB per-file limit`)
  }
}

console.log(`Done. Saved ${(saved / 1024 / 1024).toFixed(2)} MB.`)

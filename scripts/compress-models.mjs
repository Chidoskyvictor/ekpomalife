/**
 * Compress any GLB in public/models larger than LIMIT_MB with meshopt
 * via @gltf-transform/cli. Safe to re-run (skips files already under the limit).
 *
 *   node scripts/compress-models.mjs
 *   node scripts/compress-models.mjs --limit=20
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'models')
const limitMb = Number(
  (process.argv.find((a) => a.startsWith('--limit=')) || '--limit=20').split('=')[1],
)
const limitBytes = limitMb * 1024 * 1024

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

const cli = join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js')

for (const file of oversized) {
  const before = statSync(file).size
  const tmp = `${file}.meshopt.glb`
  console.log(`Compressing ${relative(process.cwd(), file)} (${(before / 1024 / 1024).toFixed(2)} MB)…`)
  execFileSync(
    process.execPath,
    [cli, 'optimize', file, tmp, '--compress', 'meshopt', '--texture-compress', 'webp'],
    { stdio: 'inherit' },
  )
  const after = statSync(tmp).size
  unlinkSync(file)
  renameSync(tmp, file)
  console.log(
    `  → ${(after / 1024 / 1024).toFixed(2)} MB (${Math.round((1 - after / before) * 100)}% smaller)`,
  )
  if (after > 25 * 1024 * 1024) {
    console.error(`  WARNING: still over Cloudflare's 25 MB per-file limit`)
  }
}

console.log('Done.')

/**
 * Cloudflare Workers static assets: 25 MiB per file. Source zips belong in vendor/
 * or gitignored public/models/*.zip — never in .open-next/assets.
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS_ROOT = join(process.cwd(), '.open-next', 'assets')
/** Stay under Wrangler's 25 MiB asset cap */
const MAX_BYTES = 24 * 1024 * 1024

function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      walk(full)
      continue
    }
    const size = statSync(full).size
    const isOversizedZip = ent.name.toLowerCase().endsWith('.zip') && size > MAX_BYTES
    const isHostelSourceZip = /hostelbuildings\.zip$/i.test(ent.name)
    if (isOversizedZip || isHostelSourceZip) {
      console.log(`strip-cloudflare-assets: remove ${full} (${(size / 1024 / 1024).toFixed(2)} MiB)`)
      unlinkSync(full)
    }
  }
}

try {
  walk(ASSETS_ROOT)
} catch (err) {
  if (err?.code === 'ENOENT') {
    console.warn('strip-cloudflare-assets: .open-next/assets missing (skip)')
    process.exit(0)
  }
  throw err
}

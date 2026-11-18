import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

/**
 * OpenNext → Cloudflare Workers (Node.js compat).
 * Prefer this over @cloudflare/next-on-pages for Next.js 16.
 *
 * Prerendered pages (like `/`) are served from the copy built at deploy time instead of being
 * re-rendered by the Worker on every request. Without this the default "dummy" cache always
 * missed, so each visit ran a full React render and sometimes hit the Worker CPU limit (error 1102).
 * Nothing uses ISR/revalidate, so a read-only cache from the static assets is enough; each deploy
 * ships fresh pages.
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
})

import type { PoolClient } from 'pg'
import type { pool } from '../db.js'

/** How much ẹta is talking about each tag this week (land demand, business buzz, coin hype). */
export async function tagMentions(db: PoolClient | typeof pool, prefix: string) {
  const rows = await db.query<{ tag: string; n: number }>(
    `SELECT tag, COUNT(*)::int AS n FROM eta_posts, unnest(tags) AS tag
     WHERE created_at > NOW() - INTERVAL '7 days' AND tag LIKE $1 GROUP BY tag`,
    [`${prefix}%`],
  )
  return new Map(rows.rows.map((r) => [r.tag.slice(prefix.length), r.n]))
}

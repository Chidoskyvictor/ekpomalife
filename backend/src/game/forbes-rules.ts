/* Ekpoma Forbes rich list: pure ranking rules (no database), so they can be tested alone. */

export const FORBES_TOP = 100

export type WorthRow = {
  userId: string
  username: string
  displayName: string
  netWorth: number
  detail: string
  appearance: unknown
  avatarColor: string
}

export type ForbesEntry = WorthRow & { rank: number }

export type Board = {
  top: ForbesEntry[]
  total: number
  /** The viewer's own place; null for admins or players who are not ranked. */
  me: ForbesEntry | null
}

/** ADMIN_USERNAMES (comma-separated, any case) as a lower-case set. */
export function adminSet(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Drops admins, sorts richest first (ties: older account order as given), numbers ranks from 1.
 * Admins are never in `top`, never counted in `total`, and never get a `me` rank bar.
 */
export function buildBoard(rows: WorthRow[], admins: Set<string>, viewerId: string | null, top = FORBES_TOP): Board {
  const ranked = rows
    .filter((row) => !admins.has(row.username.toLowerCase()))
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.netWorth - a.row.netWorth || a.index - b.index)
    .map(({ row }, i): ForbesEntry => ({ ...row, rank: i + 1 }))
  return {
    top: ranked.slice(0, top),
    total: ranked.length,
    me: viewerId ? (ranked.find((entry) => entry.userId === viewerId) ?? null) : null,
  }
}

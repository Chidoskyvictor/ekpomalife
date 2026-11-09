/* Ekpoma Forbes rich list: pure ranking rules (no database), so they can be tested alone. */

export const FORBES_PAGE = 100

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
  /** One page of the ranking, richest first, starting at `offset`. */
  entries: ForbesEntry[]
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
 * Admins are never in `entries`, never counted in `total`, and never get a `me` rank bar.
 */
export function buildBoard(rows: WorthRow[], admins: Set<string>, viewerId: string | null, offset = 0, limit = FORBES_PAGE): Board {
  const ranked = rows
    .filter((row) => !admins.has(row.username.toLowerCase()))
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.netWorth - a.row.netWorth || a.index - b.index)
    .map(({ row }, i): ForbesEntry => ({ ...row, rank: i + 1 }))
  return {
    entries: ranked.slice(offset, offset + limit),
    total: ranked.length,
    me: viewerId ? (ranked.find((entry) => entry.userId === viewerId) ?? null) : null,
  }
}

const LODGING_NAMES: Record<string, string> = {
  'hostel-poultry': 'Hostel',
  'single-poultry': 'Single room',
  'selfcon-g2': 'Self-con',
  'onebed-ojo': 'One bedroom',
}

/** "Student · Law · Self-con" or "Graduate · Single room". */
export function detailLine(department: string, lodgingId: string | null): string {
  const parts = department === 'Graduate' ? ['Graduate'] : ['Student', department]
  const home = lodgingId ? LODGING_NAMES[lodgingId] : null
  if (home) parts.push(home)
  return parts.join(' · ')
}


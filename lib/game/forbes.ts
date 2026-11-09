import { apiGet } from '@/lib/api/client'

/* Ekpoma Forbes rich list (display side; backend/src/game/forbes.ts decides net worth and hides admins). */

export type ForbesEntry = {
  rank: number
  userId: string
  username: string
  displayName: string
  netWorth: number
  detail: string
  appearance: unknown
  avatarColor: string
}

export type ForbesBoard = { top: ForbesEntry[]; total: number; me: ForbesEntry | null; updatedAt: string }

export const fetchForbes = () => apiGet<{ ok: true } & ForbesBoard>('/forbes')

/** Podium shows 2nd, 1st, 3rd left to right. Missing places are skipped. */
export function podiumOrder(top: ForbesEntry[]): ForbesEntry[] {
  return [top[1], top[0], top[2]].filter((e): e is ForbesEntry => !!e)
}

/** "Updated just now" / "Updated 3 min ago". */
export function updatedLabel(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(mins) || mins < 1) return 'Updated just now'
  return `Updated ${mins} min ago`
}

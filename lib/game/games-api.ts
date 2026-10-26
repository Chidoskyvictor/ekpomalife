import { apiGet, apiPost } from '@/lib/api/client'

/** Phone → Games. Mirrors backend/src/game/games.ts. */

export type GameMatch = {
  id: string
  game: string
  variant: string
  kind: 'challenge' | 'quick'
  stake: number
  status: 'pending' | 'active' | 'finished' | 'declined' | 'expired' | 'cancelled' | 'disputed'
  /** 0 = host (challenged / queued first, breaks first), 1 = guest */
  myIndex: 0 | 1
  names: [string, string]
  opponent: string | null
  /** A challenge waiting for you to answer */
  incoming: boolean
  won: boolean | null
  expiresAt: string
}

export type SnookerVariant = 'six' | 'classic' | 'clearance' | 'black'

export const SNOOKER_VARIANTS: { id: SnookerVariant; label: string; note: string }[] = [
  { id: 'six', label: 'Six reds', note: 'Quick frame' },
  { id: 'classic', label: '15 reds', note: 'Full frame' },
  { id: 'clearance', label: 'Colours', note: 'Yellow to black' },
  { id: 'black', label: 'Black ball', note: 'Sudden death' },
]

type MatchOk = { ok: true; match: GameMatch }

export const fetchMatches = () => apiGet<{ ok: true; matches: GameMatch[]; betMatchesLeft: number }>('/games/matches')
export const fetchMatch = (id: string) => apiGet<MatchOk>(`/games/matches/${encodeURIComponent(id)}`)

export const challengePlayer = (username: string, variant: SnookerVariant, stake: number) =>
  apiPost<MatchOk>('/games/challenges', { game: 'snooker', variant, username, stake })

export const joinQuickMatch = (variant: SnookerVariant, stake: number) =>
  apiPost<MatchOk>('/games/quick', { game: 'snooker', variant, stake })

export const acceptMatch = (id: string) => apiPost<MatchOk>(`/games/matches/${encodeURIComponent(id)}/accept`, {})
export const closeMatch = (id: string) => apiPost<{ ok: true }>(`/games/matches/${encodeURIComponent(id)}/close`, {})

export const reportMatch = (id: string, winner: 'me' | 'opponent', forfeit = false) =>
  apiPost<MatchOk & { status: string }>(`/games/matches/${encodeURIComponent(id)}/report`, { winner, forfeit })

export const rewardCpuWin = () => apiPost<{ ok: true; rewarded: boolean; fun: number }>('/games/reward', {})

export const matchTicket = (id: string) =>
  apiPost<{ ok: true; ticket: string; seat: 0 | 1 }>(`/games/matches/${encodeURIComponent(id)}/ticket`, {})

/** ws(s)://<api>/ws/<path>. A local API address is swapped for this page's host so phones on the same Wi-Fi work. */
export function apiSocketUrl(path: string) {
  let base = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')
  const local = /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base)
  const host = window.location.hostname
  if (local && !['localhost', '127.0.0.1'].includes(host) && !host.endsWith('.localhost')) {
    base = base.replace(/\/\/(127\.0\.0\.1|localhost)/, `//${host}`)
  }
  return `${base.replace(/^http/, 'ws')}${path}`
}

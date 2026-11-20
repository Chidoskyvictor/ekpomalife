import { apiGet, apiPost } from '@/lib/api/client'

/** Phone → Games hub. Mirrors backend/src/game/game-hub.ts and game-results.ts. */

export type HubPlayer = { username: string; displayName: string; avatarColor: string; appearance: unknown }

export type HubTable = {
  id: string
  game: string
  variant: string
  stake: number
  pot: number
  note: string
  host: HubPlayer
  expiresAt: string
  mine: boolean
}

export type HubLiveMatch = {
  id: string
  game: string
  variant: string
  stake: number
  pot: number
  startedAt: string | null
  watching: number
  players: [HubPlayer, HubPlayer]
}

export type ChartEntry = HubPlayer & {
  rank: number
  games: number
  wins: number
  winRate: number
  won: number
  me: boolean
}

export type ChartPeriod = 'week' | 'all'

export type GameSummary = { playing: number; tables: number; players: number }

export const fetchTables = (game?: string) =>
  apiGet<{ ok: true; tables: HubTable[]; betMatchesLeft: number }>(`/games/tables${game ? `?game=${encodeURIComponent(game)}` : ''}`)

export const hostTable = (input: { game: string; variant?: string; stake: number; note?: string }) =>
  apiPost<{ ok: true; id: string }>('/games/tables', input)

export const sitAtTable = (id: string) => apiPost<{ ok: true; matchId: string }>(`/games/tables/${encodeURIComponent(id)}/sit`, {})
export const cancelTable = (id: string) => apiPost<{ ok: true }>(`/games/tables/${encodeURIComponent(id)}/cancel`, {})

export const fetchLive = () => apiGet<{ ok: true; matches: HubLiveMatch[] }>('/games/live')
export const fetchSummary = () => apiGet<{ ok: true; games: Record<string, GameSummary> }>('/games/summary')

export const watchTicket = (id: string) =>
  apiPost<{ ok: true; ticket: string; match: { id: string; game: string; variant: string; stake: number; names: [string, string] } }>(
    `/games/matches/${encodeURIComponent(id)}/watch`,
    {},
  )

export const fetchChart = (game: string, period: ChartPeriod) =>
  apiGet<{ ok: true; entries: ChartEntry[]; me: ChartEntry | null; myGames: number; minGames: number }>(
    `/games/charts?game=${encodeURIComponent(game)}&period=${period}`,
  )

export const fetchHeadToHead = (username: string) =>
  apiGet<{ ok: true; wins: number; losses: number; draws: number; net: number }>(`/games/h2h/${encodeURIComponent(username)}`)

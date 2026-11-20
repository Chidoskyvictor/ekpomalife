import { apiGet, apiPost } from '@/lib/api/client'
import { apiSocketUrl } from '@/lib/game/games-api'

export type WhotTable = {
  id: string
  code: string
  hostId: string
  maxPlayers: number
  stake: number
  status: string
  pot: number
  expiresAt: string
  mySeat: number | null
  players: { seat: number; username: string; forfeited: boolean }[]
  isHost: boolean
  betMatchesLeft: number
}

import type { WhotEvent, WhotRules, WhotView } from '@/lib/game/whot-rules'

export type { WhotRules } from '@/lib/game/whot-rules'

/** What the table sends each phone (and what the computer game builds locally). */
export type WhotClientState = WhotView & {
  names: string[]
  pot: number
  mySeat: number
  turnSecondsLeft: number
  events: WhotEvent[]
}

export const createWhotTable = (maxPlayers: number, stake: number, rules: WhotRules) =>
  apiPost<{ ok: true; table: WhotTable }>('/whot/tables', { maxPlayers, stake, ...rules })

export const joinWhotTable = (code: string) => apiPost<{ ok: true; table: WhotTable }>('/whot/tables/join', { code })

export const fetchWhotTable = (id: string) => apiGet<{ ok: true; table: WhotTable }>(`/whot/tables/${encodeURIComponent(id)}`)

export const leaveWhotTable = (id: string) => apiPost<{ ok: true }>(`/whot/tables/${encodeURIComponent(id)}/leave`, {})

export const startWhotTable = (id: string) =>
  apiPost<{ ok: true; table: WhotTable }>(`/whot/tables/${encodeURIComponent(id)}/start`, {})

export const whotTicket = (id: string) =>
  apiPost<{ ok: true; ticket: string; seat: number }>(`/whot/tables/${encodeURIComponent(id)}/ticket`, {})

export const rewardWhotCpuWin = () => apiPost<{ ok: true; rewarded: boolean; fun: number }>('/whot/reward/cpu', {})

export function whotSocketUrl(ticket: string) {
  return apiSocketUrl(`/ws/whot?ticket=${encodeURIComponent(ticket)}`)
}

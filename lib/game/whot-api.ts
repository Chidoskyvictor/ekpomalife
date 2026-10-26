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

export type WhotCardView = {
  value: number
  shape: string
  move?: string
  iNeed?: string
}

export type WhotClientState = {
  phase: 'playing' | 'over'
  pileTop: WhotCardView | null
  marketCount: number
  currentSeat: number | null
  players: {
    seat: number
    name: string
    cardCount: number
    eliminated: boolean
    isTurn: boolean
  }[]
  alerts: { kind: string; seat?: number; text?: string }[]
  winnerSeat: number | null
  mustPick: boolean
  callShape: string | null
  pot: number
  turnSecondsLeft: number
  hand: WhotCardView[]
  mySeat: number
}

export const createWhotTable = (maxPlayers: number, stake: number) =>
  apiPost<{ ok: true; table: WhotTable }>('/whot/tables', { maxPlayers, stake })

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

import { apiGet, apiPost } from '@/lib/api/client'
import type { WhotTable } from '@/lib/game/whot-api'

/** Ludo tables (2–4 players, join by code). Mirrors backend/src/game/ludo-tables.ts; same shape as Whot tables. */
export type LudoTable = WhotTable

export const createLudoTable = (maxPlayers: number, stake: number) =>
  apiPost<{ ok: true; table: LudoTable }>('/ludo/tables', { maxPlayers, stake })
export const joinLudoTable = (code: string) => apiPost<{ ok: true; table: LudoTable }>('/ludo/tables/join', { code })
export const fetchLudoTable = (id: string) => apiGet<{ ok: true; table: LudoTable }>(`/ludo/tables/${encodeURIComponent(id)}`)
export const leaveLudoTable = (id: string) => apiPost<{ ok: true }>(`/ludo/tables/${encodeURIComponent(id)}/leave`, {})
export const startLudoTable = (id: string) =>
  apiPost<{ ok: true; table: LudoTable }>(`/ludo/tables/${encodeURIComponent(id)}/start`, {})
export const ludoTableTicket = (id: string) =>
  apiPost<{ ok: true; ticket: string; seat: number }>(`/ludo/tables/${encodeURIComponent(id)}/ticket`, {})

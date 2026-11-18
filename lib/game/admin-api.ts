import { apiGet, apiPost } from '@/lib/api/client'
import type { SpaceStatus, SpaceVisibility } from './spaces-api'

export type SpaceReportRow = {
  spaceId: string
  title: string
  status: SpaceStatus
  visibility: SpaceVisibility
  placeId: string | null
  host: { id: string; username: string }
  hostBanned: boolean
  reportCount: number
  lastReportAt: string
  reasons: string[]
}

export const fetchSpaceReports = () => apiGet<{ ok: true; reports: SpaceReportRow[] }>('/admin/space-reports')

export const adminEndSpace = (spaceId: string) =>
  apiPost<{ ok: true; ended: boolean }>(`/admin/spaces/${encodeURIComponent(spaceId)}/end`, {})

export const adminBanHost = (spaceId: string) =>
  apiPost<{ ok: true; hostId: string }>(`/admin/spaces/${encodeURIComponent(spaceId)}/ban-host`, {})

/* Billboard ad tracking (backend/src/game/ad-clicks.ts) */
export type AdAction = 'open' | 'whatsapp' | 'call' | 'group' | 'share'
export type AdTotals = { adId: string; board: number; action: AdAction; total: number; players: number; guests: number }
export type AdClickRow = { adId: string; board: number; action: AdAction; username: string | null; at: string }

export const fetchAdClicks = () => apiGet<{ ok: true; totals: AdTotals[]; recent: AdClickRow[] }>('/admin/ad-clicks')

/** Fire-and-forget: a lost click never gets in the player's way. */
export function logAdClick(board: number, adId: string, action: AdAction) {
  void apiPost<{ ok: true }>('/ads/click', { board, adId, action }).catch(() => {})
}

export type GigDisputeRow = { id: string; title: string; category: string; fee: number; budget: number; escrow: number; owner: string; worker: string | null; reason: string | null; doneAt: string | null }
export type GigReportRow = { id: string; gigId: string | null; gigTitle: string | null; hidden: boolean | null; pro: string | null; reason: string; reporter: string; createdAt: string }

export const fetchGigDisputes = () => apiGet<{ ok: true; disputes: GigDisputeRow[]; reports: GigReportRow[] }>('/admin/gigs/disputes')
export const adminResolveGig = (id: string, to: 'worker' | 'owner') => apiPost<{ ok: true }>(`/admin/gigs/${encodeURIComponent(id)}/resolve`, { to })
export const adminHideGig = (id: string, hidden: boolean) => apiPost<{ ok: true }>(`/admin/gigs/${encodeURIComponent(id)}/hide`, { hidden })

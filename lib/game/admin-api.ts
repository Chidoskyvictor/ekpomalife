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

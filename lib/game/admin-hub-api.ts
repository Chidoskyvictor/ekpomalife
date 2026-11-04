import { apiGet, apiPost } from '@/lib/api/client'

export type AdminStats = {
  visits: { total: number; today: number; days: { day: string; count: number }[] }
  players: { total: number; newToday: number; online: number; playedToday: number }
  revenue: { today: number; week: number; month: number; total: number; count: number; pending: number; failed: number }
  feedback: { waiting: number; rewarded: number }
}

export type AdminTopup = {
  id: string
  username: string
  pack: string
  amount: number
  status: 'success' | 'pending' | 'failed'
  reference: string
  createdAt: string
  paidAt: string | null
}

export type AdminSubmission = {
  id: string
  username: string
  kind: string
  label: string
  body: string
  stars: number | null
  status: 'new' | 'rewarded' | 'rejected'
  hidden: boolean
  reward: number
  reviewedBy: string | null
  votes: number
  createdAt: string
}

export const fetchAdminMe = () => apiGet<{ ok: true; username: string }>('/admin/me')
export const fetchAdminStats = () => apiGet<{ ok: true } & AdminStats>('/admin/stats')
export const fetchAdminTopups = (status: AdminTopup['status']) =>
  apiGet<{ ok: true; topups: AdminTopup[] }>(`/admin/topups?status=${status}`)
export const fetchAdminSubmissions = (status: 'new' | 'rewarded' | 'rejected' | 'all') =>
  apiGet<{ ok: true; submissions: AdminSubmission[] }>(`/admin/hub/submissions?status=${status}`)
export const rewardSubmission = (id: string, amount: number) =>
  apiPost<{ ok: true }>(`/admin/hub/submissions/${encodeURIComponent(id)}/reward`, { amount })
export const rejectSubmission = (id: string) => apiPost<{ ok: true }>(`/admin/hub/submissions/${encodeURIComponent(id)}/reject`, {})
export const hideSubmission = (id: string, hidden: boolean) =>
  apiPost<{ ok: true }>(`/admin/hub/submissions/${encodeURIComponent(id)}/hide`, { hidden })
export const postDevUpdate = (body: string) => apiPost<{ ok: true; id: string }>('/admin/hub/posts', { body })
export const deleteDevUpdate = (id: string) => apiPost<{ ok: true }>(`/admin/hub/posts/${encodeURIComponent(id)}/delete`, {})

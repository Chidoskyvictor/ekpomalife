import { apiGet, apiPost } from '@/lib/api/client'

/*
 * Bae & Family (display side; backend/src/game/bae.ts decides everything: closeness, limits, consent).
 */

export const BAE_NEEDED = 40
export const RELATION_OPTIONS = [
  { id: 'sibling', label: 'Sibling', emoji: '🧑🏾‍🤝‍🧑🏾' },
  { id: 'cousin', label: 'Cousin', emoji: '🫶🏾' },
  { id: 'parent', label: 'Parent', emoji: '👨🏾‍👧🏾' },
  { id: 'uncle_aunt', label: 'Uncle / Aunt', emoji: '🧓🏾' },
] as const
export type RelationId = (typeof RELATION_OPTIONS)[number]['id']

export type FamilyRequest = {
  id: string
  kind: 'bae' | 'relative'
  relation: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'
  /** I sent it. */
  mine: boolean
  from: string
  to: string
  expiresAt: string
}

export type Goal = { id: string; label: string; emoji: string; target: number; done: number }
type Online = { online: boolean; atHome: boolean }
export type Bae = Online & {
  userId: string
  username: string
  appearance: unknown
  sneaky: boolean
  since: string
  closeness: number
  level: number
  xp: number
  goals: Goal[]
  anniversaryDue: boolean
}
export type Relative = Online & { userId: string; username: string; appearance: unknown; role: string; roleLabel: string }
export type DateSpot = { id: string; label: string; emoji: string; cost: number }
export type FamilyEvent = { id: string; kind: string; body: string; at: string }

export type Family = {
  maxBaes: number
  hideStatus: boolean
  baes: Bae[]
  relatives: Relative[]
  incoming: FamilyRequest[]
  outgoing: FamilyRequest[]
  events: FamilyEvent[]
  dateSpots: DateSpot[]
}

/** What a player card shows about one other player. */
export type WithPlayer = {
  closeness: number
  needed: number
  progress: string
  unlocked: boolean
  baes: boolean
  sneaky: boolean
  pendingBae: FamilyRequest | null
  pendingRelative: FamilyRequest | null
  relativeRole: string | null
  cooldownHours: number
  /** null = they hid it. */
  theirStatus: string | null
  iAmFull: boolean
}

const u = encodeURIComponent
export const fetchFamily = () => apiGet<{ ok: true } & Family>('/family')
export const markFamilySeen = () => apiPost<{ ok: true }>('/family/seen', {})
export const fetchWithPlayer = (username: string) => apiGet<{ ok: true } & WithPlayer>(`/family/with/${u(username)}`)
export const sendFamilyRequest = (username: string, kind: 'bae' | 'relative', relation?: RelationId) =>
  apiPost<{ ok: true; request: FamilyRequest }>(`/family/with/${u(username)}/request`, { kind, relation })
export const fetchFamilyRequest = (id: string) => apiGet<{ ok: true; request: FamilyRequest }>(`/family/requests/${u(id)}`)
export const respondFamilyRequest = (id: string, accept: boolean) =>
  apiPost<{ ok: true; request: FamilyRequest }>(`/family/requests/${u(id)}/respond`, { accept })
export const cancelFamilyRequest = (id: string) => apiPost<{ ok: true; request: FamilyRequest }>(`/family/requests/${u(id)}/cancel`, {})
export const setSneaky = (username: string, on: boolean) => apiPost<{ ok: true } & Family>(`/family/baes/${u(username)}/sneaky`, { on })
export const breakUp = (username: string) => apiPost<{ ok: true } & Family>(`/family/baes/${u(username)}/breakup`, {})
export const planDate = (username: string, spot: string) =>
  apiPost<{ ok: true; caught: boolean; spot: DateSpot; family: Family }>(`/family/baes/${u(username)}/date`, { spot })
export const claimAnniversary = (username: string) => apiPost<{ ok: true } & Family>(`/family/baes/${u(username)}/anniversary`, {})
export const removeRelative = (username: string) => apiPost<{ ok: true } & Family>(`/family/relatives/${u(username)}/remove`, {})
export const saveHideStatus = (hideStatus: boolean) => apiPost<{ ok: true; hideStatus: boolean }>('/family/settings', { hideStatus })

/** Anything that answers a request tells the others to refresh (chat card, Family app, card). */
export const FAMILY_EVENT = 'ekpoma:family-changed'
export const announceFamilyChange = () => window.dispatchEvent(new Event(FAMILY_EVENT))

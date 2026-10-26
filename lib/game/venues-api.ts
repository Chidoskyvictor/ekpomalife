import { apiGet, apiPost } from '@/lib/api/client'

/** Clubs (Sazza). Mirrors backend/src/game/venues.ts. */

export type VenueItem = {
  id: string
  kind: 'dance' | 'drink' | 'vip' | 'bottle'
  name: string
  emoji: string
  price: number
  minutes: number
  vipOnly?: boolean
}

export type Spender = { username: string; displayName: string; spent: number }

export type VenueView = {
  venue: { id: string; name: string; hours: string; open: boolean; entry: number; items: VenueItem[] }
  me: { paid: boolean; vip: boolean; spent: number; group: number | null }
  cash: number
  /** People inside right now, all crowd groups. */
  inside: number
  /** Tonight's biggest spenders ("shutting it down"). */
  top: Spender[]
}

export type ClubPerson = {
  userId: string
  username: string
  displayName: string
  appearance: unknown
  vip: boolean
  spent: number
  /** In the same crowd group as you (you can see them in the club). */
  sameGroup: boolean
}

const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() })

export function fetchVenue(id: string) {
  return apiGet<{ ok: true } & VenueView>(`/venues/${encodeURIComponent(id)}`)
}

export function enterVenue(id: string) {
  return apiPost<{ ok: true; message: string; group: number }>(`/venues/${encodeURIComponent(id)}/enter`, {}, idem())
}

export function buyAtVenue(id: string, itemId: string) {
  return apiPost<{ ok: true; message: string; cash?: number }>(
    `/venues/${encodeURIComponent(id)}/buy`,
    { itemId },
    idem(),
  )
}

/** Amounts you can spray (mirrors backend SPRAY_AMOUNTS). */
export const SPRAY_AMOUNTS = [10_000, 50_000, 100_000, 500_000, 1_000_000]

export function sprayMoney(id: string, amount: number) {
  return apiPost<{
    ok: true
    message: string
    cash: number
    sprayId: string
    notes: { note: number; value: number }[]
    endsAt: number
    by: string
    byUsername: string
  }>(`/venues/${encodeURIComponent(id)}/spray`, { amount }, idem())
}

export function venueHeartbeat(id: string) {
  return apiPost<{ ok: true }>(`/venues/${encodeURIComponent(id)}/heartbeat`, {})
}

export function leaveVenue(id: string) {
  return apiPost<{ ok: true }>(`/venues/${encodeURIComponent(id)}/leave`, {})
}

export function fetchClubPeople(id: string, offset = 0) {
  return apiGet<{ ok: true; total: number; people: ClubPerson[]; next: number | null }>(
    `/venues/${encodeURIComponent(id)}/people?offset=${offset}`,
  )
}

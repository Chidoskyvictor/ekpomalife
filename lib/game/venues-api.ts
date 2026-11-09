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

export type SocialKind = 'hello' | 'gist' | 'joke' | 'compliment'

/** Say Hello / Gist / Crack Joke / Compliment someone here (NPC target: "npc:<id>"). */
export function socialAtVenue(id: string, kind: SocialKind, target: string) {
  return apiPost<{ ok: true; landed: boolean }>(`/venues/${encodeURIComponent(id)}/social`, { kind, target }, idem())
}

export function venueHeartbeat(id: string) {
  return apiPost<{ ok: true; closed?: boolean; message?: string }>(`/venues/${encodeURIComponent(id)}/heartbeat`, {})
}

export function leaveVenue(id: string) {
  return apiPost<{ ok: true }>(`/venues/${encodeURIComponent(id)}/leave`, {})
}

export function fetchClubPeople(id: string, offset = 0) {
  return apiGet<{ ok: true; total: number; people: ClubPerson[]; next: number | null }>(
    `/venues/${encodeURIComponent(id)}/people?offset=${offset}`,
  )
}

/* —— Hype (mirrors backend/src/game/club-hype.ts) —— */

export type HypeTier = 'hype' | 'mega' | 'round' | 'shutdown'
export const HYPE_TIERS: { id: HypeTier; emoji: string; label: string; price: number; target: boolean; blurb: string }[] = [
  { id: 'hype', emoji: '🔥', label: 'Hype', price: 5_000_000, target: true, blurb: 'DJ shout-out' },
  { id: 'mega', emoji: '🎆', label: 'Mega hype', price: 15_000_000, target: true, blurb: 'DJ + fireworks' },
  { id: 'round', emoji: '🍹', label: 'Buy a round', price: 100_000_000, target: false, blurb: 'Drinks for all' },
  { id: 'shutdown', emoji: '👑', label: 'Shut it down', price: 1_000_000_000, target: false, blurb: 'Club is yours' },
]

export type HypeEvent = {
  id: string
  tier: HypeTier
  byUsername: string
  toUsername: string | null
  toUserId: string | null
  amount: number
}

/** Pay to hype a player (tier hype / mega, with their userId) or the whole club (round / shutdown). */
export function hypeAtVenue(id: string, tier: HypeTier, target?: string) {
  return apiPost<{ ok: true; message: string; cash: number } & HypeEvent>(
    `/venues/${encodeURIComponent(id)}/hype`,
    target ? { tier, target } : { tier },
    idem(),
  )
}

export type PromotedSong = { id: string; title: string; artist: string; linkUrl: string; coverUrl: string | null; weight: number }

/** Songs promoted on the club screen (added by admins only). */
export function fetchClubSongs(id: string) {
  return apiGet<{ ok: true; songs: PromotedSong[] }>(`/venues/${encodeURIComponent(id)}/songs`)
}

/* —— Your tab (receipt built server-side from the ledger) —— */
export type TabGroup = { type: 'food' | 'entry' | 'spray' | 'hype'; title: string; lines: { label: string; qty: number; amount: number }[] }
export type VenueTab = { club: { name: string; emoji: string }; arrivedAt: string; total: number; groups: TabGroup[] }

export function fetchVenueTab(id: string) {
  return apiGet<{ ok: true } & VenueTab>(`/venues/${encodeURIComponent(id)}/tab`)
}

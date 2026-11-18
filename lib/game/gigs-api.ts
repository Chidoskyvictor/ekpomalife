import { apiGet, apiPost, apiPut, apiRequest } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import { newIdempotencyKey } from './room-api'

/* Gigs: the player-to-player job market (backend/src/game/gigs.ts). Ranks and thresholds live on the server. */

export type GigCategory = 'decorator' | 'cleaner' | 'driver' | 'dj' | 'cook' | 'other'
export type GigStatus = 'open' | 'hired' | 'working' | 'done' | 'completed' | 'cancelled' | 'disputed'

export const GIG_CATEGORIES: { id: GigCategory; label: string; emoji: string }[] = [
  { id: 'decorator', label: 'Decorator', emoji: '🛋️' },
  { id: 'cleaner', label: 'Cleaner', emoji: '🧹' },
  { id: 'driver', label: 'Driver', emoji: '🚗' },
  { id: 'dj', label: 'DJ', emoji: '🎧' },
  { id: 'cook', label: 'Cook', emoji: '🍲' },
  { id: 'other', label: 'Other', emoji: '✨' },
]
export const categoryOf = (id: string) => GIG_CATEGORIES.find((c) => c.id === id) ?? GIG_CATEGORIES[5]!

/** Start-time choices (hours from now); the server accepts only these. */
export const GIG_START_CHOICES = [
  { h: 0, label: 'Now' },
  { h: 1, label: '1 hour' },
  { h: 6, label: '6 hours' },
  { h: 24, label: 'Tomorrow' },
  { h: 48, label: '2 days' },
  { h: 72, label: '3 days' },
] as const

export type GigPerson = {
  userId: string
  username: string
  name: string
  jobs: number
  rating: number | null
  rank: { id: string; label: string; emoji: string; order: number }
  ownerRating: number | null
  online: boolean
}

export type GigApplicant = { person: GigPerson; message: string; at: string }

export type Gig = {
  id: string
  category: GigCategory
  categoryLabel: string
  title: string
  details: string
  fee: number
  budget: number
  budgetLeft: number
  escrow: number
  status: GigStatus
  startAt: string
  expiresAt: string
  doneAt: string | null
  autoAcceptAt: string | null
  createdAt: string
  role: 'owner' | 'worker' | 'offered' | 'viewer'
  owner: GigPerson | null
  worker: GigPerson | null
  directTo: GigPerson | null
  applicantCount: number
  applied: boolean
  applicants: GigApplicant[]
  ratingForWorker: number | null
  ratingForOwner: number | null
  disputeReason: string | null
  hidden: boolean
  is3D: boolean
  keyOpen: boolean
  houseOwner: string | null
  canUndo: boolean
}

export type Pro = GigPerson & { categories: GigCategory[]; fromPrice: number; pitch: string; free: boolean; isMe: boolean }
export type MyPro = { categories: GigCategory[]; fromPrice: number; pitch: string; active: boolean }

type Ok<T> = { ok: true } & T
type Res<T> = Promise<Ok<T> | ApiFail>

export const fetchBoard = (category?: GigCategory | null): Res<{ gigs: Gig[] }> => apiGet(`/gigs/board${category ? `?category=${category}` : ''}`)
export const fetchPros = (category?: GigCategory | null): Res<{ pros: Pro[]; mine: MyPro | null }> => apiGet(`/gigs/pros${category ? `?category=${category}` : ''}`)
export const fetchGig = (id: string): Res<{ gig: Gig }> => apiGet(`/gigs/${encodeURIComponent(id)}`)
export const fetchMine = (): Res<{ gigs: Gig[] }> => apiGet('/gigs/mine')
export const fetchWorking = (): Res<{ gigs: Gig[] }> => apiGet('/gigs/working')

const idem = (key: string) => ({ 'Idempotency-Key': key })
/** A fresh key per tap: the screen disables the button while the call runs, so it is never reused by mistake. */
const post = <T = Record<string, never>>(path: string, body?: unknown): Res<T & { message?: string }> => apiPost(path, body ?? {}, idem(newIdempotencyKey()))

export type NewGig = { category: GigCategory; title: string; details: string; fee: number; budget: number; startInHours: number; directTo?: string }
export const postGig = (g: NewGig) => post<{ id: string }>('/gigs', g)
export const applyToGig = (id: string, message: string) => post(`/gigs/${id}/apply`, { message })
export const hireWorker = (id: string, workerId: string) => post(`/gigs/${id}/hire`, { workerId })
export const respondToOffer = (id: string, accept: boolean) => post(`/gigs/${id}/offer`, { accept })
export const startGig = (id: string) => post(`/gigs/${id}/start`)
export const markGigDone = (id: string) => post(`/gigs/${id}/done`)
export const acceptGig = (id: string) => post(`/gigs/${id}/accept`)
export const cancelGig = (id: string) => post(`/gigs/${id}/cancel`)
export const disputeGig = (id: string, reason: string) => post(`/gigs/${id}/dispute`, { reason })
export const undoGigLayout = (id: string) => post(`/gigs/${id}/undo-layout`)
export const rateGig = (id: string, stars: number): Res<{ message?: string }> => apiPost(`/gigs/${id}/rate`, { stars })
export const reportGig = (id: string, reason: string): Res<{ message?: string }> => apiPost(`/gigs/${id}/report`, { reason })
export const reportPro = (userId: string, reason: string): Res<{ message?: string }> => apiPost(`/gigs/pros/${encodeURIComponent(userId)}/report`, { reason })
export const saveMyPro = (p: { categories: GigCategory[]; fromPrice: number; pitch: string }): Res<Record<string, never>> => apiPut('/gigs/pros/me', p)
export const removeMyPro = (): Res<Record<string, never>> => apiRequest('/gigs/pros/me', { method: 'DELETE' })

/** The job key for a house: set when you are hired as its decorator (or cleaner) and the window is open. */
export type JobKey = { gigId: string; category: GigCategory; title: string; budgetLeft: number; started: boolean; endsAt: string }
export const fetchJobKey = (ownerUsername: string): Res<{ key: JobKey | null; keys?: JobKey[] }> => apiGet(`/gigs/key/${encodeURIComponent(ownerUsername)}`)

export const GIG_STATUS_LABEL: Record<GigStatus, string> = {
  open: 'Open',
  hired: 'Hired',
  working: 'In progress',
  done: 'Waiting for OK',
  completed: 'Paid',
  cancelled: 'Cancelled',
  disputed: 'With support',
}

/** "Starts in 5h" / "Started" for a gig time. */
export function startsLabel(startAt: string, now = Date.now()): string {
  const ms = new Date(startAt).getTime() - now
  if (ms <= 60_000) return 'Now'
  const h = Math.round(ms / 3_600_000)
  if (h < 1) return `In ${Math.max(1, Math.round(ms / 60_000))} min`
  return h < 24 ? `In ${h}h` : `In ${Math.round(h / 24)}d`
}

/** Mess props in a house (Cleaner job): tile positions on the home grid. */
export type MessProp = { id: string; kind: string; x: number; z: number }
export const fetchHouseMess = (username: string): Res<{ mess: MessProp[]; cleanliness: number }> => apiGet(`/homes/${encodeURIComponent(username)}/mess`)
export const cleanMessProp = (gigId: string, messId: string): Res<{ mess: MessProp[]; cleanliness: number; cleaned: number; message?: string }> =>
  apiPost(`/gigs/${encodeURIComponent(gigId)}/clean`, { messId }, idem(newIdempotencyKey()))

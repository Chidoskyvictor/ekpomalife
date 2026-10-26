import { apiGet, apiPost } from '@/lib/api/client'

/* Mirrors backend/src/routes/spaces.ts */

export type SpaceTab = 'live' | 'upcoming' | 'mine' | 'here'
export type SpaceVisibility = 'public' | 'link' | 'invite'
export type SpaceStatus = 'scheduled' | 'live' | 'ended'
export type SpaceRole = 'host' | 'speaker' | 'listener'

export type SpaceCard = {
  id: string
  title: string
  host: { id: string; username: string }
  placeId: string | null
  visibility: SpaceVisibility
  status: SpaceStatus
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  endsBy: string | null
  maxListeners: number
  askToSpeak: boolean
  present: number
  /** Host + approved speakers in the room */
  speakers: number
  faces: string[]
  mine: boolean
  /** Host only */
  joinCode?: string
}

export type SpacePerson = {
  userId: string
  username: string
  role: SpaceRole
  /** Host only: when they raised a hand */
  askedToSpeak?: string | null
}

export type SpaceJoin = {
  ok: true
  spaceId: string
  role: SpaceRole
  livekit: { url: string; token: string }
  startMuted: boolean
  endsBy: string
}

export type CreateSpaceInput = {
  title: string
  placeId?: string | null
  visibility: SpaceVisibility
  scheduledAt?: string | null
  maxListeners?: number
  askToSpeak?: boolean
}

const id = (spaceId: string) => encodeURIComponent(spaceId)

export const fetchSpaces = (tab: SpaceTab, placeId?: string | null) =>
  apiGet<{ ok: true; tab: SpaceTab; spaces: SpaceCard[] }>(
    `/spaces?tab=${tab}${placeId ? `&place_id=${encodeURIComponent(placeId)}` : ''}`,
  )

export const fetchSpace = (spaceId: string) =>
  apiGet<{ ok: true; space: SpaceCard; people: SpacePerson[] }>(`/spaces/${id(spaceId)}`)

/** Start now → the host is already joined (SpaceJoin). Scheduled → just the card. */
export const createSpace = (input: CreateSpaceInput) =>
  apiPost<SpaceJoin | { ok: true; space: SpaceCard }>('/spaces', input)

export const joinSpace = (spaceId: string) => apiPost<SpaceJoin>(`/spaces/${id(spaceId)}/join`, {})

export const joinSpaceByCode = (code: string) => apiPost<SpaceJoin>(`/spaces/join-code/${encodeURIComponent(code)}`, {})

export const leaveSpace = (spaceId: string) => apiPost<{ ok: true; ended: boolean }>(`/spaces/${id(spaceId)}/leave`, {})

export const endSpace = (spaceId: string) => apiPost<{ ok: true; ended: boolean }>(`/spaces/${id(spaceId)}/end`, {})

export const reportSpace = (spaceId: string, reason: string) =>
  apiPost<{ ok: true; message: string }>(`/spaces/${id(spaceId)}/report`, { reason })

export const banFromSpace = (spaceId: string, userId: string) =>
  apiPost<{ ok: true }>(`/spaces/${id(spaceId)}/ban`, { userId })

export const requestToSpeak = (spaceId: string) =>
  apiPost<{ ok: true; role: SpaceRole; requested?: boolean }>(`/spaces/${id(spaceId)}/request-speak`, {})

export const approveSpeaker = (spaceId: string, userId: string, approve: boolean) =>
  apiPost<{ ok: true; userId: string; role: SpaceRole }>(`/spaces/${id(spaceId)}/approve-speaker`, { userId, approve })

export const isJoin = (res: SpaceJoin | { ok: true; space: SpaceCard }): res is SpaceJoin => 'livekit' in res

// ---------------------------------------------------------------- scheduling

const MIN = 60_000
const DAY = 24 * 60 * MIN
const LAGOS_OFFSET = 60 * MIN

/** Lagos wall-clock "YYYY-MM-DD" of an instant (UTC+1, no DST). */
export function lagosDayKey(at: Date): string {
  return new Date(at.getTime() + LAGOS_OFFSET).toISOString().slice(0, 10)
}

/** Bookable days for the date strip: today + the next 6 (the server allows 7 days ahead). */
export function scheduleDays(now: Date): { key: string; label: string; sub: string }[] {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: 7 }, (_, i) => {
    const local = new Date(now.getTime() + LAGOS_OFFSET + i * DAY)
    return {
      key: local.toISOString().slice(0, 10),
      label: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : names[local.getUTCDay()]!,
      sub: String(local.getUTCDate()),
    }
  })
}

/** 15-minute slots on a Lagos day that are still bookable (future, within 7 days). */
export function slotsForDay(dayKey: string, now: Date): Date[] {
  const start = Date.parse(`${dayKey}T00:00:00Z`) - LAGOS_OFFSET
  const out: Date[] = []
  for (let t = start; t < start + DAY; t += 15 * MIN) {
    if (t > now.getTime() && t <= now.getTime() + 7 * DAY) out.push(new Date(t))
  }
  return out
}

export function slotLabel(at: Date): string {
  return at.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })
}

/** "Today 4:30 PM", "Tomorrow 9:00 AM", "Thu 2:15 PM" */
export function whenLabel(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const diff = Date.parse(`${lagosDayKey(at)}T00:00:00Z`) - Date.parse(`${lagosDayKey(now)}T00:00:00Z`)
  const day =
    diff === 0
      ? 'Today'
      : diff === DAY
        ? 'Tomorrow'
        : at.toLocaleDateString('en-NG', { weekday: 'short', timeZone: 'Africa/Lagos' })
  return `${day} ${slotLabel(at)}`
}

/** "12:34" / "1:02:03" until `iso`; null once passed. */
export function countdown(iso: string, now = Date.now()): string | null {
  const s = Math.floor((Date.parse(iso) - now) / 1000)
  if (!Number.isFinite(s) || s <= 0) return null
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

// ---------------------------------------------------------------- comments

export type SpaceComment = { id: string; userId: string; username: string; body: string; createdAt: string }

/** Latest comments (oldest first); pass `since` (a createdAt) for only newer ones — drop repeats by id. */
export const fetchComments = (spaceId: string, since?: string | null) =>
  apiGet<{ ok: true; comments: SpaceComment[] }>(
    `/spaces/${id(spaceId)}/comments${since ? `?since=${encodeURIComponent(since)}` : ''}`,
  )

export const postComment = (spaceId: string, text: string) =>
  apiPost<{ ok: true; comment: Omit<SpaceComment, 'username'> }>(`/spaces/${id(spaceId)}/comments`, { text })

export const COMMENT_MAX = 200

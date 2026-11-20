import { apiGet, apiPost } from '@/lib/api/client'
import { apiUrl } from '@/lib/game/api'

/** ẹta — Ekpoma's social feed. Mirrors backend/src/game/eta.ts. */

export const ETA_POST_MAX = 280

export type EtaAuthor = {
  kind: 'user' | 'npc'
  id: string
  name: string
  handle: string
  /** look = the player's character appearance (drawn as their face picture) */
  avatar: { color: string; emoji: string | null; look?: unknown; support?: boolean; image?: string }
  /** Gold badge + "NPC" label */
  npc: boolean
}

export type EtaPost = {
  id: string
  author: EtaAuthor
  body: string
  tags: string[]
  likes: number
  liked: boolean
  replies: number
  reposts: number
  reposted: boolean
  views: number
  photo: { url: string; w: number; h: number } | null
  replyTo: string | null
  createdAt: string
  mine: boolean
  giveaway: { prize: number; endsAt: string; settled: boolean; winnerPostId: string | null } | null
}

export type EtaProfile = {
  author: EtaAuthor
  bio: string
  followers: number | null
  following: number | null
  isFollowing: boolean
  isMe?: boolean
}

export type EtaVoice = { author: EtaAuthor; followers: number; fire: number }

export type FeedTab = 'foryou' | 'money' | 'following'

export const fetchFeed = (tab: FeedTab, before?: string) =>
  apiGet<{ ok: true; posts: EtaPost[]; hasMore: boolean }>(`/eta/feed?tab=${tab}${before ? `&before=${before}` : ''}`)

export const fetchThread = (id: string) =>
  apiGet<{ ok: true; post: EtaPost; replies: EtaPost[] }>(`/eta/posts/${encodeURIComponent(id)}`)

export const fetchProfile = (kind: 'user' | 'npc', id: string) =>
  apiGet<{ ok: true; profile: EtaProfile; posts: EtaPost[] }>(`/eta/profile/${kind}/${encodeURIComponent(id)}`)

export const fetchTopVoices = () => apiGet<{ ok: true; voices: EtaVoice[] }>('/eta/top')

export const fetchTagged = (tag: string) => apiGet<{ ok: true; posts: EtaPost[] }>(`/eta/tag/${encodeURIComponent(tag)}`)

export const createGist = (body: string, replyTo?: string, photoId?: string) =>
  apiPost<{ ok: true; post: EtaPost }>('/eta/posts', {
    body,
    ...(replyTo ? { replyTo: Number(replyTo) } : {}),
    ...(photoId ? { photoId: Number(photoId) } : {}),
  })

export const toggleRepost = (id: string) => apiPost<{ ok: true; reposted: boolean; reposts: number }>(`/eta/posts/${id}/repost`, {})

/** Count one view for each post the player scrolled past (fire and forget). */
export const sendViews = (ids: string[]) => apiPost<{ ok: true }>('/eta/views', { ids: ids.map(Number) })

/** Upload a shrunk photo for a gist; returns its id to attach with createGist. */
export async function uploadGistPhoto(blob: Blob, w: number, h: number): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${apiUrl()}/eta/photos?w=${w}&h=${h}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': blob.type || 'image/webp' },
      body: blob,
      signal: AbortSignal.timeout(45_000),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string }
    if (res.ok && data.ok && data.id) return { ok: true, id: data.id }
    return { ok: false, error: data.error ?? 'Couldn’t upload the photo.' }
  } catch {
    return { ok: false, error: 'No connection. The photo wasn’t uploaded.' }
  }
}

const photoCache = new Map<string, Promise<string | null>>()

/** Gist photos need the login cookie, so fetch them as a blob and show that. Cached per session. */
export function loadGistPhoto(path: string): Promise<string | null> {
  let hit = photoCache.get(path)
  if (!hit) {
    hit = fetch(`${apiUrl()}${path}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null)
    photoCache.set(path, hit)
  }
  return hit
}

export const toggleFire = (id: string) => apiPost<{ ok: true; liked: boolean; likes: number }>(`/eta/posts/${id}/like`, {})

export const reportGist = (id: string) => apiPost<{ ok: true }>(`/eta/posts/${id}/report`, {})

export const toggleFollow = (kind: 'user' | 'npc', id: string) =>
  apiPost<{ ok: true; following: boolean }>('/eta/follow', { kind, id })

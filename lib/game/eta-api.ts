import { apiGet, apiPost } from '@/lib/api/client'

/** ẹta — Ekpoma's social feed. Mirrors backend/src/game/eta.ts. */

export const ETA_POST_MAX = 280

export type EtaAuthor = {
  kind: 'user' | 'npc'
  id: string
  name: string
  handle: string
  avatar: { color: string; emoji: string | null }
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

export const createGist = (body: string, replyTo?: string) =>
  apiPost<{ ok: true; post: EtaPost }>('/eta/posts', replyTo ? { body, replyTo: Number(replyTo) } : { body })

export const toggleFire = (id: string) => apiPost<{ ok: true; liked: boolean; likes: number }>(`/eta/posts/${id}/like`, {})

export const reportGist = (id: string) => apiPost<{ ok: true }>(`/eta/posts/${id}/report`, {})

export const toggleFollow = (kind: 'user' | 'npc', id: string) =>
  apiPost<{ ok: true; following: boolean }>('/eta/follow', { kind, id })

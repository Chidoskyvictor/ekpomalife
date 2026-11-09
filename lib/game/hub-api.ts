import { apiGet, apiPost } from '@/lib/api/client'

export type FeedbackKind = 'review' | 'complaint' | 'bug' | 'experience'
export type SubmissionKind = FeedbackKind | 'suggestion'

export type Suggestion = {
  id: string
  body: string
  username: string
  votes: number
  mine: boolean
  voted: boolean
  rewarded: boolean
  createdAt: string
}

export type MySubmission = {
  id: string
  kind: SubmissionKind
  body: string
  status: 'new' | 'rewarded' | 'rejected'
  reward: number
  createdAt: string
}

export const REACTIONS = ['👍', '🔥', '😂', '❤️'] as const
export type DevPost = {
  id: string
  author: string
  body: string
  createdAt: string
  reactions: Record<string, number>
  mine: string | null
}

export const submitHub = (kind: SubmissionKind, body: string, stars?: number | null) =>
  apiPost<{ ok: true; id: string; message: string }>('/hub/submit', { kind, body, stars: stars ?? null })

export const fetchMySubmissions = () => apiGet<{ ok: true; left: number; items: MySubmission[] }>('/hub/mine')

export const fetchSuggestions = (sort: 'top' | 'new') =>
  apiGet<{ ok: true; suggestions: Suggestion[] }>(`/hub/suggestions?sort=${sort}`)

export const voteSuggestion = (id: string) =>
  apiPost<{ ok: true; voted: boolean; votes: number }>(`/hub/suggestions/${encodeURIComponent(id)}/vote`, {})

export const fetchDevPosts = () => apiGet<{ ok: true; posts: DevPost[] }>('/hub/posts')

export const reactToPost = (id: string, emoji: string) =>
  apiPost<{ ok: true }>(`/hub/posts/${encodeURIComponent(id)}/react`, { emoji })

/* Pitch Room (backend/src/game/pitch.ts) */
export type Pitch = {
  id: string
  idea: string
  readyAt: string
  startedAt: string
  ready: boolean
  result: { accepted: boolean; amount: number } | null
}
export const fetchLaunch = () => apiGet<{ ok: true; hasPitched: boolean }>('/hub/launch')

export const fetchPitch = () => apiGet<{ ok: true; left: number; pending: Pitch | null; last: Pitch | null }>('/hub/pitch')
export const startPitch = (idea: string) => apiPost<{ ok: true; pitch: Pitch; left: number }>('/hub/pitch', { idea })
export const finishPitch = (id: string) =>
  apiPost<{ ok: true; pitch: Pitch; message: string | null }>(`/hub/pitch/${encodeURIComponent(id)}/finish`, {})

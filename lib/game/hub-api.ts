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

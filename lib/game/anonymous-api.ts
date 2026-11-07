import { apiGet, apiPost } from '@/lib/api/client'

/* Mirrors backend/src/routes/anonymous.ts. No response ever carries an author. */

export const CATEGORIES = [
  { id: 'confessions', label: 'Confessions' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'campus-gist', label: 'Campus gist' },
  { id: 'funny', label: 'Funny experiences' },
  { id: 'questions', label: 'Questions' },
  { id: 'opinions', label: 'Opinions' },
  { id: 'rants', label: 'Rants' },
  { id: 'general', label: 'General' },
] as const
export type AnonCategory = (typeof CATEGORIES)[number]['id']

/** Card colours: [background, text] */
export const COLORS = {
  violet: ['#6d28d9', '#ffffff'],
  rose: ['#e11d48', '#ffffff'],
  amber: ['#f59e0b', '#1f1300'],
  emerald: ['#059669', '#ffffff'],
  sky: ['#0284c7', '#ffffff'],
  slate: ['#1e293b', '#ffffff'],
  orange: ['#ea580c', '#ffffff'],
  fuchsia: ['#c026d3', '#ffffff'],
} as const
export type AnonColor = keyof typeof COLORS

export const REPORT_REASONS = [
  { id: 'harassment', label: 'Harassment' },
  { id: 'threats', label: 'Threats' },
  { id: 'bullying', label: 'Bullying' },
  { id: 'doxxing', label: 'Sharing private info' },
  { id: 'spam', label: 'Spam' },
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]['id']

export const WALL_KINDS = [
  { id: 'hostel', label: 'Hostel' },
  { id: 'faculty', label: 'Faculty' },
  { id: 'department', label: 'Department' },
  { id: 'other', label: 'Other' },
] as const
export type WallKind = (typeof WALL_KINDS)[number]['id']

export const POST_MAX = 500
export const COMMENT_MAX = 300

export type AnonPost = {
  id: string
  body: string
  color: AnonColor
  category: AnonCategory
  communityId: string | null
  communityName: string | null
  likes: number
  comments: number
  liked: boolean
  /** True only for the author */
  mine: boolean
  status: 'ok' | 'hidden' | 'removed'
  createdAt: string
}
export type AnonComment = {
  id: string
  postId: string
  body: string
  mine: boolean
  status: 'ok' | 'hidden' | 'removed'
  createdAt: string
  postPreview?: string
}
export type AnonWall = {
  id: string
  name: string
  description: string
  kind: WallKind
  members: number
  posts: number
  joined: boolean
  owner: boolean
  inviteCode: string | null
}
export type AnonYou = { warnings: number; banned: boolean }

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  const out = s.toString()
  return out ? `?${out}` : ''
}
const e = encodeURIComponent

export const fetchFeed = (opts: { sort: 'new' | 'trending'; category?: string; wall?: string; before?: string }) =>
  apiGet<{ ok: true; posts: AnonPost[]; you: AnonYou }>(`/anonymous/feed${q(opts)}`)

export const fetchMine = (tab: 'posts' | 'comments' | 'likes') =>
  apiGet<{ ok: true; posts?: AnonPost[]; comments?: AnonComment[] }>(`/anonymous/mine${q({ tab })}`)

export const createPost = (input: { body: string; color: AnonColor; category: AnonCategory; wallId?: string | null }) =>
  apiPost<{ ok: true; post: AnonPost }>('/anonymous/posts', input)

export const toggleLike = (id: string) =>
  apiPost<{ ok: true; liked: boolean; likes: number }>(`/anonymous/posts/${e(id)}/like`, {})

export const fetchComments = (id: string) =>
  apiGet<{ ok: true; comments: AnonComment[] }>(`/anonymous/posts/${e(id)}/comments`)

export const addComment = (id: string, body: string) =>
  apiPost<{ ok: true; comment: AnonComment }>(`/anonymous/posts/${e(id)}/comments`, { body })

export const reportPost = (id: string, reason: ReportReason) =>
  apiPost<{ ok: true; already: boolean }>(`/anonymous/posts/${e(id)}/report`, { reason })
export const reportComment = (id: string, reason: ReportReason) =>
  apiPost<{ ok: true; already: boolean }>(`/anonymous/comments/${e(id)}/report`, { reason })

export const hidePost = (id: string) => apiPost<{ ok: true }>(`/anonymous/posts/${e(id)}/hide`, {})
export const blockPostAuthor = (id: string) => apiPost<{ ok: true }>(`/anonymous/posts/${e(id)}/block`, {})
export const blockCommentAuthor = (id: string) => apiPost<{ ok: true }>(`/anonymous/comments/${e(id)}/block`, {})

export const fetchWalls = () => apiGet<{ ok: true; walls: AnonWall[] }>('/anonymous/walls')
export const createWall = (input: { name: string; description: string; kind: WallKind }) =>
  apiPost<{ ok: true; wall: AnonWall }>('/anonymous/walls', input)
export const joinWall = (id: string) => apiPost<{ ok: true; wall: AnonWall }>(`/anonymous/walls/${e(id)}/join`, {})
export const leaveWall = (id: string) => apiPost<{ ok: true }>(`/anonymous/walls/${e(id)}/leave`, {})
export const joinWallByCode = (code: string) =>
  apiPost<{ ok: true; wall: AnonWall }>(`/anonymous/walls/join-code/${e(code)}`, {})

export const fetchShare = (id: string) =>
  apiGet<{ ok: true; post: { id: string; body: string; color: AnonColor; category: AnonCategory; likes: number; comments: number } }>(
    `/anonymous/share/${e(id)}`,
  )

/** Link for a post. Opens a card with the text only. */
export const shareUrl = (id: string) =>
  `${typeof window === 'undefined' ? 'https://ekpomalife.app' : window.location.origin}/anon/${id}`

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'General'

/* ---- admin ---- */
export type AdminAnonRow = {
  type: 'post' | 'comment'
  id: string
  body: string
  status: string
  reportCount: number
  reasons: string[]
  author: { id: string; username: string; warnings: number; banned: boolean }
  wall: string | null
  lastReportAt: string
}
export const adminFetchAnonReports = () => apiGet<{ ok: true; reports: AdminAnonRow[] }>('/admin/anonymous/reports')
export const adminAnonAction = (type: 'post' | 'comment', id: string, action: 'dismiss' | 'remove' | 'warn' | 'ban') =>
  apiPost<{ ok: true }>(`/admin/anonymous/${type}/${e(id)}/${action}`, {})

/** Anonymous: pure rules + the public (author-free) shapes. No database in here. */

export const POST_MAX = 500
export const COMMENT_MAX = 300
export const POSTS_PER_HOUR = 5
export const COMMENTS_PER_HOUR = 30
export const WALLS_PER_DAY = 3
export const REPORTS_TO_HIDE = 3

export const CATEGORIES = [
  'confessions',
  'relationships',
  'campus-gist',
  'funny',
  'questions',
  'opinions',
  'rants',
  'general',
] as const
export type AnonCategory = (typeof CATEGORIES)[number]

export const COLORS = ['violet', 'rose', 'amber', 'emerald', 'sky', 'slate', 'orange', 'fuchsia'] as const
export type AnonColor = (typeof COLORS)[number]

export const REPORT_REASONS = ['harassment', 'threats', 'bullying', 'doxxing', 'spam'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const WALL_KINDS = ['hostel', 'faculty', 'department', 'other'] as const
export type WallKind = (typeof WALL_KINDS)[number]

const PHONE = /(?:\+?\d[\s().-]?){9,}/
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const HANDLE = /(^|[^\w])@[a-z0-9_.]{2,}/i

/** Basic doxxing filter: phone numbers, emails and @usernames are not allowed in posts or comments. */
export function looksLikeContactInfo(text: string): boolean {
  return PHONE.test(text) || EMAIL.test(text) || HANDLE.test(text)
}

/** Trim and collapse runs of blank lines; the DB check also enforces the length. */
export function cleanText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function makeInviteCode(random: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  let out = ''
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[random(CODE_ALPHABET.length)]
  return out
}
export function normalizeInviteCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === 6 ? code : null
}

/** Likes + comments, with the age of the post pulling it down. Same formula the SQL uses. */
export function trendingScore(likes: number, comments: number, ageHours: number): number {
  return (likes + 2 * comments + 1) / Math.pow(Math.max(ageHours, 0) + 2, 1.5)
}

/** Whether another report tips an item into "hidden until an admin looks". */
export function shouldAutoHide(reportCount: number, status: string, cleared: boolean): boolean {
  return status === 'ok' && !cleared && reportCount >= REPORTS_TO_HIDE
}

/* ---- Public shapes. These are the ONLY shapes students ever receive. ---- */

export type PostRow = {
  id: string
  user_id: string
  community_id: string | null
  community_name?: string | null
  body: string
  color: string
  category: string
  like_count: number
  comment_count: number
  status: string
  created_at: Date | string
  liked?: boolean
}
export type CommentRow = {
  id: string
  post_id: string
  user_id: string
  body: string
  status: string
  created_at: Date | string
}

export type PublicPost = {
  id: string
  body: string
  color: string
  category: string
  communityId: string | null
  communityName: string | null
  likes: number
  comments: number
  liked: boolean
  /** True only for the author, so their own posts can wear the "You" badge */
  mine: boolean
  status: string
  createdAt: string
}
export type PublicComment = {
  id: string
  postId: string
  body: string
  mine: boolean
  status: string
  createdAt: string
}

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString())

export function toPublicPost(row: PostRow, viewerId: string): PublicPost {
  return {
    id: row.id,
    body: row.body,
    color: row.color,
    category: row.category,
    communityId: row.community_id,
    communityName: row.community_name ?? null,
    likes: row.like_count,
    comments: row.comment_count,
    liked: Boolean(row.liked),
    mine: row.user_id === viewerId,
    status: row.status,
    createdAt: iso(row.created_at),
  }
}

export function toPublicComment(row: CommentRow, viewerId: string): PublicComment {
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    mine: row.user_id === viewerId,
    status: row.status,
    createdAt: iso(row.created_at),
  }
}

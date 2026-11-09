import { pool } from '../db.js'
import { createId } from '../ids.js'

/*
 * Songs promoted on the club LED screen. Admin-managed only (ADMIN_USERNAMES, routes/admin.ts);
 * players can't submit songs. Links and covers must be https URLs with no embedded credentials.
 */

export type PromotedSong = {
  id: string
  title: string
  artist: string
  linkUrl: string
  coverUrl: string | null
  active: boolean
  sortOrder: number
  weight: number
  startsAt: string | null
  endsAt: string | null
}

type Row = {
  id: string
  title: string
  artist: string
  link_url: string
  cover_url: string | null
  active: boolean
  sort_order: number
  weight: number
  starts_at: Date | null
  ends_at: Date | null
}

const COLUMNS = 'id, title, artist, link_url, cover_url, active, sort_order, weight, starts_at, ends_at'

const toSong = (r: Row): PromotedSong => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  linkUrl: r.link_url,
  coverUrl: r.cover_url,
  active: r.active,
  sortOrder: r.sort_order,
  weight: r.weight,
  startsAt: r.starts_at ? r.starts_at.toISOString() : null,
  endsAt: r.ends_at ? r.ends_at.toISOString() : null,
})

/** https only, no credentials, sane length. Returns the normalised URL or null. */
export function cleanHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > 500) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Songs the club screen should show right now (active, inside their dates), in play order. */
export async function activeSongs(): Promise<Omit<PromotedSong, 'active' | 'startsAt' | 'endsAt'>[]> {
  const found = await pool.query<Row>(
    `SELECT ${COLUMNS} FROM promoted_songs
     WHERE active AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())
     ORDER BY sort_order, created_at LIMIT 50`,
  )
  return found.rows.map((r) => {
    const { active: _a, startsAt: _s, endsAt: _e, ...song } = toSong(r)
    return song
  })
}

export async function listAllSongs(): Promise<PromotedSong[]> {
  const found = await pool.query<Row>(`SELECT ${COLUMNS} FROM promoted_songs ORDER BY sort_order, created_at`)
  return found.rows.map(toSong)
}

export type SongInput = {
  title: string
  artist: string
  linkUrl: string
  coverUrl?: string | null
  active?: boolean
  sortOrder?: number
  weight?: number
  startsAt?: string | null
  endsAt?: string | null
}

type Fail = { ok: false; error: string }

function checkDate(value: string | null | undefined): Date | null | 'bad' {
  if (value == null || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'bad' : d
}

export async function saveSong(input: SongInput, id?: string): Promise<{ ok: true; song: PromotedSong } | Fail> {
  const title = input.title.trim()
  const artist = input.artist.trim()
  if (!title || title.length > 120) return { ok: false, error: 'Title is required (max 120 characters).' }
  if (!artist || artist.length > 120) return { ok: false, error: 'Artist is required (max 120 characters).' }
  const link = cleanHttpsUrl(input.linkUrl)
  if (!link) return { ok: false, error: 'The song link must be a full https:// URL.' }
  let cover: string | null = null
  if (input.coverUrl) {
    cover = cleanHttpsUrl(input.coverUrl)
    if (!cover) return { ok: false, error: 'The cover image must be a full https:// URL.' }
  }
  const starts = checkDate(input.startsAt)
  const ends = checkDate(input.endsAt)
  if (starts === 'bad' || ends === 'bad') return { ok: false, error: 'Start/end dates are not valid.' }
  if (starts && ends && ends <= starts) return { ok: false, error: 'The end date must be after the start date.' }
  const weight = Math.max(1, Math.min(10, Math.round(input.weight ?? 1)))
  const sortOrder = Math.max(-10_000, Math.min(10_000, Math.round(input.sortOrder ?? 0)))
  const values = [title, artist, link, cover, input.active ?? true, sortOrder, weight, starts, ends]
  if (id) {
    const done = await pool.query<Row>(
      `UPDATE promoted_songs SET title = $2, artist = $3, link_url = $4, cover_url = $5, active = $6,
              sort_order = $7, weight = $8, starts_at = $9, ends_at = $10, updated_at = NOW()
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...values],
    )
    if (!done.rows[0]) return { ok: false, error: 'No such song.' }
    return { ok: true, song: toSong(done.rows[0]) }
  }
  const made = await pool.query<Row>(
    `INSERT INTO promoted_songs (id, title, artist, link_url, cover_url, active, sort_order, weight, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${COLUMNS}`,
    [createId(), ...values],
  )
  return { ok: true, song: toSong(made.rows[0]!) }
}

export async function deleteSong(id: string): Promise<boolean> {
  const done = await pool.query(`DELETE FROM promoted_songs WHERE id = $1`, [id])
  return (done.rowCount ?? 0) > 0
}

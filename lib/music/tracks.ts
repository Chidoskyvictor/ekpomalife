/**
 * The one list of songs: the Music app on the phone and the club set (Sazza, Forbes) both read it.
 * The order is the club's play order. The server only knows the ids (backend/src/game/music.ts).
 */
export type Track = {
  id: string
  title: string
  artist: string
  /** File under /public; the club plays these in this order. */
  src: string
  /** When it joined the set (the New tab sorts by this, then by position). */
  addedAt: string
  /** Album art: a gradient and a glyph, drawn by TrackArt. */
  art: { from: string; to: string; glow: string; glyph: string }
  /** Where else to hear it. */
  link?: { label: string; href: string }
  /** Short line under the title on the player. */
  tag: string
}

export const TRACKS: readonly Track[] = [
  {
    id: 'amapiano-bala',
    title: 'Amapiano Bala',
    artist: 'Ekpoma Life',
    src: '/audio/club/club-night.mp3',
    addedAt: '2026-10-01',
    art: { from: '#ff7a45', to: '#d6246e', glow: '#ffb27a', glyph: '🔥' },
    tag: 'Made in-house by the team',
  },
  {
    id: 'amapiano-drift',
    title: 'Amapiano Drift',
    artist: 'Ekpoma Life',
    src: '/audio/club/club-set-2.mp3',
    addedAt: '2026-11-10',
    art: { from: '#2f7bff', to: '#6a3df0', glow: '#8fb6ff', glyph: '🌊' },
    tag: 'Made in-house by the team',
  },
  {
    id: 'shakara',
    title: 'SHAKARA',
    artist: 'Lil Davix',
    src: '/audio/club/club-set-3.m4a',
    addedAt: '2026-11-10',
    art: { from: '#18b87a', to: '#0b6e8f', glow: '#7ee8c0', glyph: '💃' },
    link: { label: 'Listen on Audiomack', href: 'https://audiomack.com/db1122508/song/shakara' },
    tag: 'Played in the club set',
  },
  {
    id: 'abena',
    title: 'Abena',
    artist: 'Nuelson ft. Chidosky',
    src: '/audio/club/abena.mp3',
    addedAt: '2026-11-17',
    art: { from: '#f5b81c', to: '#e8541e', glow: '#ffe08a', glyph: '👑' },
    tag: 'Played in the club set',
  },
]

export const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]))
export const trackById = (id: string | null | undefined) => (id ? (TRACK_BY_ID.get(id) ?? null) : null)
export const CLUB_SET: string[] = TRACKS.map((t) => t.src)

/** 1.2k, 12k, 1.2M: how streams and hearts read. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`
  return `${(Math.floor(n / 100_000) / 10).toFixed(1).replace(/\.0$/, '')}M`
}

/** 3:07 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

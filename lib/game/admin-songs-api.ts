import { apiGet, apiPost, apiPut, apiRequest } from '@/lib/api/client'

/** Admin-only promoted songs (shown on the club LED screens). Mirrors backend/src/game/promoted-songs.ts. */
export type AdminSong = {
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

export type AdminSongInput = Omit<AdminSong, 'id'>

export const adminListSongs = () => apiGet<{ ok: true; songs: AdminSong[] }>('/admin/songs')
export const adminAddSong = (song: AdminSongInput) => apiPost<{ ok: true; song: AdminSong }>('/admin/songs', song)
export const adminSaveSong = (id: string, song: AdminSongInput) =>
  apiPut<{ ok: true; song: AdminSong }>(`/admin/songs/${encodeURIComponent(id)}`, song)
export const adminDeleteSong = (id: string) =>
  apiRequest<{ ok: true }>(`/admin/songs/${encodeURIComponent(id)}`, { method: 'DELETE' })

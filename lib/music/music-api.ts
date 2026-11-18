import { apiGet, apiPost, apiRequest } from '@/lib/api/client'

/* Phone → Music (backend/src/game/music.ts). */
export type TrackStats = { id: string; streams: number; likes: number; liked: boolean }

export const fetchTrackStats = () => apiGet<{ ok: true; tracks: TrackStats[] }>('/music')
export const likeTrack = (id: string) => apiPost<{ ok: true; track: TrackStats }>(`/music/${encodeURIComponent(id)}/like`)
export const unlikeTrack = (id: string) => apiRequest<{ ok: true; track: TrackStats }>(`/music/${encodeURIComponent(id)}/like`, { method: 'DELETE' })
export const postStream = (id: string) => apiPost<{ ok: true; counted: boolean; track: TrackStats }>(`/music/${encodeURIComponent(id)}/stream`)

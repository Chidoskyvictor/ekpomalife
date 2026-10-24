import { apiGet, apiPatch, useMocks } from '@/lib/api/client'
import type { PlayerProfile, PlayerProfilePatch } from './profile-types'
import { mockGetPlayerProfile, mockPatchMyProfile } from './profile-mock'

type OkProfile = { ok: true; profile: PlayerProfile }

export async function fetchMyProfile(): Promise<PlayerProfile> {
  if (useMocks()) return mockGetPlayerProfile(true)
  const res = await apiGet<OkProfile>('/players/me/profile')
  if (!res.ok) throw new Error(res.error ?? 'Could not load profile.')
  return res.profile
}

export async function patchMyProfile(patch: PlayerProfilePatch): Promise<PlayerProfile> {
  if (useMocks()) return mockPatchMyProfile(patch)
  const res = await apiPatch<OkProfile>('/players/me/profile', patch)
  if (!res.ok) throw new Error(res.error ?? 'Could not save profile.')
  return res.profile
}

export async function fetchPlayerProfile(id: string): Promise<PlayerProfile> {
  if (useMocks()) return mockGetPlayerProfile(false)
  const res = await apiGet<OkProfile>(`/players/${encodeURIComponent(id)}/profile`)
  if (!res.ok) throw new Error(res.error ?? 'Player not found.')
  return res.profile
}

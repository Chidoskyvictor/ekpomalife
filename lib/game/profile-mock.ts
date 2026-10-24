import { defaultNeeds } from './needs-defaults'
import type { PlayerProfile, PlayerProfilePatch } from './profile-types'

let mockProfile: PlayerProfile = {
  userId: 'mock-user',
  username: 'demo',
  displayName: 'Demo Student',
  avatar: { color: '#3d9ad6', emoji: '🎓' },
  department: 'Computer Science',
  studyLevel: '100L',
  bio: 'Campus runs, night class, and small wins.',
  joinDate: new Date('2025-09-01').toISOString(),
  stats: { daysPlayed: 12, reputation: 24 },
  isOwner: true,
  private: { cash: 4500, needs: defaultNeeds() },
}

export function mockGetPlayerProfile(asOwner: boolean): PlayerProfile {
  if (asOwner) return mockProfile
  const { private: _private, ...rest } = mockProfile
  return { ...rest, isOwner: false }
}

export function mockPatchMyProfile(patch: PlayerProfilePatch): PlayerProfile {
  mockProfile = {
    ...mockProfile,
    displayName: patch.displayName ?? mockProfile.displayName,
    avatar: {
      color: patch.avatarColor ?? mockProfile.avatar.color,
      emoji: patch.avatarEmoji !== undefined ? patch.avatarEmoji : mockProfile.avatar.emoji,
    },
    department: patch.department ?? mockProfile.department,
    studyLevel: patch.studyLevel ?? mockProfile.studyLevel,
    bio: patch.bio ?? mockProfile.bio,
  }
  return mockProfile
}

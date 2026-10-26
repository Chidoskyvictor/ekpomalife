import type { NeedsMap } from './needs-defaults'
import type { StudyLevel } from './profile-constants'

export type PlayerProfile = {
  userId: string
  username: string
  displayName: string
  avatar: { color: string; emoji: string | null }
  department: string
  studyLevel: StudyLevel
  bio: string
  joinDate: string
  stats: {
    daysPlayed: number
    reputation: number
    whotWins: number
  }
  isOwner: boolean
  private?: {
    cash: number
    needs: NeedsMap
  }
}

export type PlayerProfilePatch = {
  displayName?: string
  avatarColor?: string
  avatarEmoji?: string | null
  department?: string
  studyLevel?: StudyLevel
  bio?: string
}

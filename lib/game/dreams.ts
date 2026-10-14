export type DreamId =
  | 'first-class'
  | 'faculty-president'
  | 'ekpoma-landlord'
  | 'big-boy'
  | 'edo-star'
  | 'campus-celeb'
  | 'tech-founder'

export type DreamGoalType =
  | 'cgpa'
  | 'election'
  | 'net-worth'
  | 'career'
  | 'skill'
  | 'friends'
  | 'revenue'

export type DreamReward = {
  cash?: number
  reputation?: number
  badge: string
}

export type Dream = {
  id: DreamId
  emoji: string
  title: string
  subtitle: string
  goal: { type: DreamGoalType; target: number }
  reward: DreamReward
}

export type DreamSnapshot = {
  cgpa: number
  graduated: boolean
  facultyPresident: boolean
  ownsLodge: boolean
  netWorth: number
  careerLevel: number
  careerMaxLevel: number
  musicSkill: number
  bestFriends: number
  businessStarted: boolean
  businessRevenue: number
}

export type DreamProgress = {
  current: number
  target: number
  label: string
  complete: boolean
}

export const CAREER_MAX_LEVEL = 10
export const MUSIC_MAX_LEVEL = 10

export const DREAMS: Dream[] = [
  {
    id: 'first-class',
    emoji: '🎓',
    title: 'First class graduate',
    subtitle: 'Graduate from AAU with a first class.',
    goal: { type: 'cgpa', target: 4.5 },
    reward: { cash: 50000, badge: 'First class' },
  },
  {
    id: 'faculty-president',
    emoji: '🗳️',
    title: 'Faculty president',
    subtitle: 'Win the faculty president election.',
    goal: { type: 'election', target: 1 },
    reward: { reputation: 20, badge: 'Faculty president' },
  },
  {
    id: 'ekpoma-landlord',
    emoji: '🏠',
    title: 'Ekpoma landlord',
    subtitle: 'Own a lodge and build a net worth of ₦1,000,000.',
    goal: { type: 'net-worth', target: 1_000_000 },
    reward: { reputation: 15, badge: 'Ekpoma landlord' },
  },
  {
    id: 'big-boy',
    emoji: '💼',
    title: 'Big boy / big girl',
    subtitle: 'Reach the top level of any career.',
    goal: { type: 'career', target: CAREER_MAX_LEVEL },
    reward: { cash: 40000, badge: 'Top of the ladder' },
  },
  {
    id: 'edo-star',
    emoji: '🎤',
    title: 'Edo afrobeats star',
    subtitle: 'Max out the Music skill (level 10).',
    goal: { type: 'skill', target: MUSIC_MAX_LEVEL },
    reward: { cash: 30000, reputation: 10, badge: 'Edo star' },
  },
  {
    id: 'campus-celeb',
    emoji: '🤝',
    title: 'Campus celebrity',
    subtitle: 'Become best friends with 5 people.',
    goal: { type: 'friends', target: 5 },
    reward: { reputation: 15, badge: 'Campus celebrity' },
  },
  {
    id: 'tech-founder',
    emoji: '💻',
    title: 'Ekpoma tech founder',
    subtitle: 'Start a business and hit ₦500,000 revenue.',
    goal: { type: 'revenue', target: 500_000 },
    reward: { cash: 25000, badge: 'Tech founder' },
  },
]

const DREAM_BY_ID = new Map(DREAMS.map((dream) => [dream.id, dream]))

export function getDream(id: string | null | undefined): Dream | null {
  if (!id) return null
  return DREAM_BY_ID.get(id as DreamId) ?? null
}

export function isDreamId(value: string | null | undefined): value is DreamId {
  return Boolean(value && DREAM_BY_ID.has(value as DreamId))
}

export function normalizeDreamId(input?: string | null): DreamId | null {
  return isDreamId(input) ? input : null
}

export function emptyDreamSnapshot(): DreamSnapshot {
  return {
    cgpa: 3,
    graduated: false,
    facultyPresident: false,
    ownsLodge: false,
    netWorth: 0,
    careerLevel: 1,
    careerMaxLevel: CAREER_MAX_LEVEL,
    musicSkill: 0,
    bestFriends: 0,
    businessStarted: false,
    businessRevenue: 0,
  }
}

function naira(value: number) {
  return `₦${Math.max(0, Math.round(value)).toLocaleString()}`
}

export function dreamProgress(dream: Dream, snapshot: DreamSnapshot): DreamProgress {
  switch (dream.goal.type) {
    case 'cgpa': {
      const current = snapshot.graduated ? snapshot.cgpa : Math.min(snapshot.cgpa, dream.goal.target - 0.01)
      return {
        current,
        target: dream.goal.target,
        label: snapshot.graduated
          ? `${dream.title}: ${snapshot.cgpa.toFixed(2)} / ${dream.goal.target.toFixed(1)}`
          : `${dream.title}: CGPA ${snapshot.cgpa.toFixed(2)} / ${dream.goal.target.toFixed(1)}`,
        complete: snapshot.graduated && snapshot.cgpa >= dream.goal.target,
      }
    }
    case 'election':
      return {
        current: snapshot.facultyPresident ? 1 : 0,
        target: 1,
        label: snapshot.facultyPresident ? `${dream.title}: elected` : `${dream.title}: not elected yet`,
        complete: snapshot.facultyPresident,
      }
    case 'net-worth':
      return {
        current: snapshot.netWorth,
        target: dream.goal.target,
        label: `${dream.title}: ${naira(snapshot.netWorth)} / ${naira(dream.goal.target)}`,
        complete: snapshot.ownsLodge && snapshot.netWorth >= dream.goal.target,
      }
    case 'career':
      return {
        current: snapshot.careerLevel,
        target: dream.goal.target,
        label: `${dream.title}: level ${snapshot.careerLevel} / ${dream.goal.target}`,
        complete: snapshot.careerLevel >= dream.goal.target,
      }
    case 'skill':
      return {
        current: snapshot.musicSkill,
        target: dream.goal.target,
        label: `${dream.title}: Music ${snapshot.musicSkill} / ${dream.goal.target}`,
        complete: snapshot.musicSkill >= dream.goal.target,
      }
    case 'friends':
      return {
        current: snapshot.bestFriends,
        target: dream.goal.target,
        label: `${dream.title}: ${snapshot.bestFriends} / ${dream.goal.target} friends`,
        complete: snapshot.bestFriends >= dream.goal.target,
      }
    case 'revenue':
      return {
        current: snapshot.businessRevenue,
        target: dream.goal.target,
        label: snapshot.businessStarted
          ? `${dream.title}: ${naira(snapshot.businessRevenue)} / ${naira(dream.goal.target)}`
          : `${dream.title}: start a business`,
        complete: snapshot.businessStarted && snapshot.businessRevenue >= dream.goal.target,
      }
  }
}

export function isDreamComplete(dreamId: DreamId, snapshot: DreamSnapshot) {
  const dream = getDream(dreamId)
  return dream ? dreamProgress(dream, snapshot).complete : false
}

export function snapshotFromLife(cash: number, dream: DreamSnapshot): DreamSnapshot {
  return { ...dream, netWorth: cash }
}

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
  title: string
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

const DREAMS: Dream[] = [
  {
    id: 'first-class',
    title: 'First class graduate',
    goal: { type: 'cgpa', target: 4.5 },
    reward: { cash: 50000, badge: 'First class' },
  },
  {
    id: 'faculty-president',
    title: 'Faculty president',
    goal: { type: 'election', target: 1 },
    reward: { reputation: 20, badge: 'Faculty president' },
  },
  {
    id: 'ekpoma-landlord',
    title: 'Ekpoma landlord',
    goal: { type: 'net-worth', target: 1_000_000 },
    reward: { reputation: 15, badge: 'Ekpoma landlord' },
  },
  {
    id: 'big-boy',
    title: 'Big boy / big girl',
    goal: { type: 'career', target: 10 },
    reward: { cash: 40000, badge: 'Top of the ladder' },
  },
  {
    id: 'edo-star',
    title: 'Edo afrobeats star',
    goal: { type: 'skill', target: 10 },
    reward: { cash: 30000, reputation: 10, badge: 'Edo star' },
  },
  {
    id: 'campus-celeb',
    title: 'Campus celebrity',
    goal: { type: 'friends', target: 5 },
    reward: { reputation: 15, badge: 'Campus celebrity' },
  },
  {
    id: 'tech-founder',
    title: 'Ekpoma tech founder',
    goal: { type: 'revenue', target: 500_000 },
    reward: { cash: 25000, badge: 'Tech founder' },
  },
]

const DREAM_BY_ID = new Map(DREAMS.map((dream) => [dream.id, dream]))

export function getDream(id: string | null | undefined): Dream | null {
  if (!id) return null
  return DREAM_BY_ID.get(id as DreamId) ?? null
}

export function isDreamId(value: unknown): value is DreamId {
  return typeof value === 'string' && DREAM_BY_ID.has(value as DreamId)
}

function naira(value: number) {
  return `₦${Math.max(0, Math.round(value)).toLocaleString()}`
}

export function clampSnapshot(input: unknown): DreamSnapshot {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const num = (key: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const value = raw[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, value))
  }
  const flag = (key: string) => raw[key] === true
  return {
    cgpa: num('cgpa', 3, 0, 5),
    graduated: flag('graduated'),
    facultyPresident: flag('facultyPresident'),
    ownsLodge: flag('ownsLodge'),
    netWorth: Math.round(num('netWorth', 0, 0, 50_000_000)),
    careerLevel: Math.round(num('careerLevel', 1, 1, 10)),
    careerMaxLevel: 10,
    musicSkill: Math.round(num('musicSkill', 0, 0, 10)),
    bestFriends: Math.round(num('bestFriends', 0, 0, 20)),
    businessStarted: flag('businessStarted'),
    businessRevenue: Math.round(num('businessRevenue', 0, 0, 50_000_000)),
  }
}

export function dreamProgress(dream: Dream, snapshot: DreamSnapshot) {
  switch (dream.goal.type) {
    case 'cgpa':
      return {
        current: snapshot.cgpa,
        target: dream.goal.target,
        label: `${dream.title}: CGPA ${snapshot.cgpa.toFixed(2)} / ${dream.goal.target.toFixed(1)}`,
        complete: snapshot.graduated && snapshot.cgpa >= dream.goal.target,
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

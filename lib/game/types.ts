export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night'

export type LocationType =
  | 'campus'
  | 'hostel'
  | 'community'
  | 'food'
  | 'transport'
  | 'shop'
  | 'leisure'
  | 'worship'

export type StatKey = 'cash' | 'energy' | 'health' | 'reputation' | 'academic'

export type Faculty = 'Arts' | 'Sciences' | 'Law' | 'Medicine' | 'Engineering' | 'Social Sciences'

export type FeedTone = 'good' | 'bad' | 'neutral'

export type FeedEntry = {
  id: string
  text: string
  tone: FeedTone
  day: number
  period: TimePeriod
}

export type GameState = {
  playerId: string
  characterName: string
  faculty: Faculty
  avatarColor: string
  cash: number
  energy: number
  health: number
  reputation: number
  academic: number
  locationId: string
  day: number
  period: TimePeriod
  hasPhone: boolean
  milestones: string[]
  feed: FeedEntry[]
}

export type ActionId =
  | 'study'
  | 'socialize'
  | 'rest'
  | 'eat'
  | 'buy_phone'
  | 'buy_snack'
  | 'errand'
  | 'pos_shift'
  | 'watch_match'
  | 'pray'
  | 'market_run'
  | 'feedback'
  | 'workout'
  | 'night_class'

export type ActionDef = {
  id: ActionId
  label: string
  hint: string
  cost?: number
  energyCost?: number
  periods: number
}

export type LocationRecord = {
  id: string
  name: string
  type: LocationType
  emoji: string
  description: string
  position: [number, number]
  size: [number, number, number]
  actions: ActionId[]
  npc?: { name: string; role: string; line: string }
}

export type EventChoice = {
  label: string
  effects: Partial<Record<StatKey, number>>
  outcome: string
}

export type GameEvent = {
  id: string
  title: string
  description: string
  locationId?: string
  choices: EventChoice[]
}

export type TravelMode = 'walk' | 'keke'

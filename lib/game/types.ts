import type { CampusState } from './campus'
import type { DreamId, DreamSnapshot } from './dreams'
import type { Appearance } from './look'
import type { CharacterTypeId, LodgingId } from './live'
import type { TraitId } from './traits'

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
  username: string
  avatarColor: string
  appearance?: Appearance
  traits?: TraitId[]
  dreamId?: DreamId | null
  characterType?: CharacterTypeId
  lodgingId?: LodgingId
  courseId?: string
  dream: DreamSnapshot
  badges: string[]
  dreamCompleted: boolean
  dreamCelebrated: boolean
  cash: number
  energy: number
  health: number
  reputation: number
  academic: number
  hunger: number
  hygiene: number
  fun: number
  social: number
  xp: number
  locationId: string
  day: number
  period: TimePeriod
  /** In-game clock label from the server (e.g. "2:40 PM"). */
  timeLabel?: string
  hasPhone: boolean
  milestones: string[]
  feed: FeedEntry[]
  /** Server-owned academic progress (fees, attendance, GPA). */
  campus?: CampusState
  /** In-game minutes from midnight when known from server. */
  gameTime?: number
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

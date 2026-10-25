import type { Needs } from './needs.js'
import type { OpenHours } from './time.js'

export type GameActionId =
  | 'eat'
  | 'sleep'
  | 'shower'
  | 'study'
  | 'hangout'
  | 'travel'
  | 'work-placeholder'
  | 'nap'
  | 'rest'
  | 'toilet'
  | 'bucket-bath'
  | 'cook'

export type ActionDef = {
  id: GameActionId
  label: string
  hint: string
  /** Cash delta (negative = cost). */
  cost: number
  /** In-game minutes consumed. */
  duration: number
  needEffects: Partial<Needs>
  /** If set, only these place ids allow the action. Empty = any place that lists it. */
  allowedPlaces?: string[]
  openHours?: OpenHours | null
  /** Can be done on furniture in your own room (Home tab), wherever you are on the map. */
  home?: boolean
  /** Home action that needs a kitchen (self-con and one bedroom). */
  kitchen?: boolean
}

export const ACTIONS: Record<GameActionId, ActionDef> = {
  eat: {
    id: 'eat',
    label: 'Eat',
    hint: 'Plate of rice. Fill hunger.',
    cost: -800,
    duration: 30,
    needEffects: { hunger: 35, fun: 5 },
  },
  sleep: {
    id: 'sleep',
    label: 'Sleep',
    hint: 'Rest and refill energy.',
    cost: 0,
    duration: 240,
    needEffects: { energy: 50, hygiene: -5, hunger: -10 },
    home: true,
  },
  shower: {
    id: 'shower',
    label: 'Shower',
    hint: 'Fresh body, clear head.',
    cost: -100,
    duration: 20,
    needEffects: { hygiene: 40, energy: 5 },
  },
  study: {
    id: 'study',
    label: 'Study',
    hint: 'The books are calling.',
    cost: 0,
    duration: 90,
    needEffects: { study: 20, energy: -15, fun: -5 },
    home: true,
  },
  hangout: {
    id: 'hangout',
    label: 'Hang out',
    hint: 'Chat and relax.',
    cost: -200,
    duration: 60,
    needEffects: { social: 25, fun: 20, energy: -8 },
  },
  travel: {
    id: 'travel',
    label: 'Travel',
    hint: 'Move to another place (keke).',
    cost: -300,
    duration: 20,
    needEffects: { energy: -5 },
  },
  'work-placeholder': {
    id: 'work-placeholder',
    label: 'Side hustle',
    hint: 'Earn a small wage. Placeholder job.',
    cost: 600,
    duration: 120,
    needEffects: { energy: -20, fun: -5, social: 5 },
  },
  // —— Room furniture (Home tab) ——
  nap: {
    id: 'nap',
    label: 'Take a nap',
    hint: 'Quick lie-down.',
    cost: 0,
    duration: 60,
    needEffects: { energy: 18, hunger: -3 },
    home: true,
  },
  rest: {
    id: 'rest',
    label: 'Sit down',
    hint: 'Take the weight off your feet.',
    cost: 0,
    duration: 15,
    needEffects: { energy: 4, fun: 3 },
    home: true,
  },
  toilet: {
    id: 'toilet',
    label: 'Use the toilet',
    hint: 'When you have to go.',
    cost: 0,
    duration: 5,
    needEffects: { hygiene: 6, fun: 2 },
    home: true,
  },
  'bucket-bath': {
    id: 'bucket-bath',
    label: 'Bucket bath',
    hint: 'Fetch water, scrub well.',
    cost: 0,
    duration: 25,
    needEffects: { hygiene: 35, energy: -3 },
    home: true,
  },
  cook: {
    id: 'cook',
    label: 'Cook',
    hint: 'Pot of rice on your own gas. Cheaper than buying food.',
    cost: -400,
    duration: 45,
    needEffects: { hunger: 30, fun: 3, energy: -4 },
    home: true,
    kitchen: true,
  },
}

export const ACTION_IDS = Object.keys(ACTIONS) as GameActionId[]

export function getAction(id: string | null | undefined): ActionDef | null {
  if (!id || !(id in ACTIONS)) return null
  return ACTIONS[id as GameActionId]
}

/** Suggested action for the most urgent need. */
export function actionForNeed(need: keyof Needs): { actionId: GameActionId; placeHint: string } {
  switch (need) {
    case 'hunger':
      return { actionId: 'eat', placeHint: 'bukka' }
    case 'energy':
      return { actionId: 'sleep', placeHint: 'school-hostels-1' }
    case 'hygiene':
      return { actionId: 'shower', placeHint: 'school-hostels-1' }
    case 'fun':
      return { actionId: 'hangout', placeHint: 'relaxation-centre' }
    case 'social':
      return { actionId: 'hangout', placeHint: 'students-centre' }
    case 'study':
      return { actionId: 'study', placeHint: 'admin-block' }
  }
}

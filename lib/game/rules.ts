import { ACTIONS, EVENTS, getLocation, START_LOCATION_ID } from './content'
import type {
  ActionId,
  EventChoice,
  FeedTone,
  GameEvent,
  GameState,
  StatKey,
  TimePeriod,
  TravelMode,
} from './types'

export const STARTER_CASH = 5000
export const PERIODS: TimePeriod[] = ['morning', 'afternoon', 'evening', 'night']

export const OBJECTIVES = [
  { id: 'buy_phone', label: 'Buy your phone at Campus Shop', locationId: 'campus_shop' },
  { id: 'first_errand', label: 'Run a campus errand at the Admin Block', locationId: 'aau_campus' },
  { id: 'first_meal', label: 'Eat at Mama Amina Bukka', locationId: 'roadside_bukka' },
] as const

export type ActionResult = { state: GameState; ok: boolean; message: string; event?: GameEvent }

export function createInitialState(name: string, username: string, avatarColor: string): GameState {
  return {
    playerId: crypto.randomUUID(),
    characterName: name,
    username,
    avatarColor,
    cash: STARTER_CASH,
    energy: 100,
    health: 100,
    reputation: 0,
    academic: 50,
    locationId: START_LOCATION_ID,
    day: 1,
    period: 'morning',
    hasPhone: false,
    milestones: [],
    feed: [
      {
        id: crypto.randomUUID(),
        text: `Welcome to Ekpoma, ${name}. Fresh AAU student, ₦${STARTER_CASH.toLocaleString()} in your pocket.`,
        tone: 'neutral',
        day: 1,
        period: 'morning',
      },
    ],
  }
}

const clamp = (value: number) => Math.max(0, Math.min(100, value))

function applyEffects(state: GameState, effects: Partial<Record<StatKey, number>>): GameState {
  return {
    ...state,
    cash: Math.max(0, state.cash + (effects.cash ?? 0)),
    energy: clamp(state.energy + (effects.energy ?? 0)),
    health: clamp(state.health + (effects.health ?? 0)),
    reputation: clamp(state.reputation + (effects.reputation ?? 0)),
    academic: clamp(state.academic + (effects.academic ?? 0)),
  }
}

function advanceTime(state: GameState, periods: number): GameState {
  let { day } = state
  let index = PERIODS.indexOf(state.period)
  for (let i = 0; i < periods; i++) {
    index += 1
    if (index >= PERIODS.length) {
      index = 0
      day += 1
    }
  }
  return { ...state, day, period: PERIODS[index]! }
}

function log(state: GameState, text: string, tone: FeedTone): GameState {
  const entry = { id: crypto.randomUUID(), text, tone, day: state.day, period: state.period }
  return { ...state, feed: [entry, ...state.feed].slice(0, 40) }
}

function addMilestone(state: GameState, id: string): GameState {
  return state.milestones.includes(id) ? state : { ...state, milestones: [...state.milestones, id] }
}

const fail = (state: GameState, message: string): ActionResult => ({ state, ok: false, message })

export function distanceBetween(fromId: string, toId: string): number {
  const from = getLocation(fromId)
  const to = getLocation(toId)
  if (!from || !to) return 0
  return Math.hypot(from.position[0] - to.position[0], from.position[1] - to.position[1])
}

export function travelQuote(fromId: string, toId: string) {
  const distance = distanceBetween(fromId, toId)
  return {
    walkEnergy: Math.ceil(distance / 5) + 2,
    kekeFare: Math.max(100, Math.round((distance * 6) / 50) * 50),
    kekeEnergy: 1,
  }
}

export function travel(state: GameState, toId: string, mode: TravelMode, roll = Math.random()): ActionResult {
  const destination = getLocation(toId)
  if (!destination || state.locationId === toId) return fail(state, 'You are already here.')
  const quote = travelQuote(state.locationId, toId)

  let next: GameState
  if (mode === 'walk') {
    if (state.energy < quote.walkEnergy) return fail(state, 'Too tired to trek that far. Take a keke or rest.')
    next = applyEffects(state, { energy: -quote.walkEnergy })
  } else {
    if (state.cash < quote.kekeFare) return fail(state, `Keke fare is ₦${quote.kekeFare}. You no get am.`)
    next = applyEffects(state, { cash: -quote.kekeFare, energy: -quote.kekeEnergy })
  }

  next = advanceTime({ ...next, locationId: toId }, 1)
  const message = mode === 'walk' ? `You trekked to ${destination.name}.` : `Keke dropped you at ${destination.name}.`
  next = log(next, message, 'neutral')

  const event = roll < 0.3 ? pickEvent(mode, roll) : undefined
  return { state: next, ok: true, message, event }
}

function pickEvent(mode: TravelMode, roll: number): GameEvent {
  const pool = mode === 'keke' ? EVENTS : EVENTS.filter((event) => event.id !== 'keke_fare_palaver')
  return pool[Math.floor((roll / 0.3) * pool.length) % pool.length]!
}

export function resolveEvent(state: GameState, event: GameEvent, choice: EventChoice): GameState {
  const affordable = (choice.effects.cash ?? 0) >= 0 || state.cash >= Math.abs(choice.effects.cash ?? 0)
  if (!affordable) return log(state, `${event.title}: you couldn't afford that, so you moved on.`, 'bad')
  const next = applyEffects(state, choice.effects)
  const positive = Object.values(choice.effects).reduce((sum, value) => sum + (value ?? 0), 0) >= 0
  return log(next, `${event.title}: ${choice.outcome}`, positive ? 'good' : 'bad')
}

export function performAction(state: GameState, actionId: ActionId, roll = Math.random()): ActionResult {
  const action = ACTIONS[actionId]
  if (action.cost && state.cash < action.cost) return fail(state, `You need ₦${action.cost.toLocaleString()} for that.`)
  if (action.energyCost && state.energy < action.energyCost) return fail(state, 'You are too tired. Eat or rest first.')

  let next = state
  let message = ''
  let tone: FeedTone = 'good'

  switch (actionId) {
    case 'study':
      next = applyEffects(next, { energy: -15, academic: 5 })
      message = 'You read for hours. Academic standing up.'
      break
    case 'night_class':
      next = applyEffects(next, { energy: -25, academic: 9, health: -3 })
      message = 'TDB (till day break) reading. Your brain is full.'
      break
    case 'socialize':
      next = applyEffects(next, { energy: -8, reputation: 3 })
      message = 'You gisted and made new connections.'
      break
    case 'rest': {
      const night = state.period === 'night' || state.period === 'evening'
      next = applyEffects(next, { energy: night ? 60 : 30, health: 8 })
      message = night ? 'You slept well. New day, new hustle.' : 'Short nap. You feel better.'
      if (night) next = advanceTime(next, state.period === 'night' ? 1 : 2)
      break
    }
    case 'eat':
      next = applyEffects(next, { cash: -800, energy: 15, health: 2 })
      next = addMilestone(next, 'first_meal')
      message = "Amina's jollof hit different. +15 energy."
      break
    case 'buy_phone':
      if (state.hasPhone) return fail(state, 'You already have a phone.')
      next = applyEffects({ ...next, hasPhone: true }, { cash: -2500 })
      next = addMilestone(next, 'buy_phone')
      message = 'New phone unlocked! Messages and town events now come to you.'
      break
    case 'buy_snack':
      next = applyEffects(next, { cash: -300, energy: 6 })
      message = 'Gala and Fanta. The student classic.'
      break
    case 'errand':
      next = applyEffects(next, { cash: 500, energy: -10 })
      next = addMilestone(next, 'first_errand')
      message = 'You ran an errand for a lecturer. +₦500.'
      break
    case 'pos_shift': {
      const pay = 400 + Math.round((roll * 500) / 50) * 50
      next = applyEffects(next, { cash: pay, energy: -20 })
      message = `POS shift done. You earned ₦${pay}.`
      break
    }
    case 'watch_match':
      next = applyEffects(next, { cash: -200, reputation: 2, energy: 4 })
      message = roll > 0.5 ? 'Your team won! The whole centre shouted.' : 'Draw. Everybody is arguing.'
      break
    case 'pray':
      next = applyEffects(next, { health: 6, reputation: 1, energy: 4 })
      message = 'Peace of mind restored.'
      break
    case 'market_run':
      next = applyEffects(next, { cash: -400, energy: 10 })
      message = 'You haggled well. Garri and groundnut secured.'
      break
    case 'feedback':
      next = applyEffects(next, { reputation: 1 })
      message = 'Thanks! The Ekpoma Life team logged your suggestion.'
      tone = 'neutral'
      break
    case 'workout':
      next = applyEffects(next, { energy: -15, health: 8, reputation: 1 })
      message = 'Laps around the pitch. Strong body, strong mind.'
      break
  }

  if (actionId !== 'rest' && action.periods > 0) next = advanceTime(next, action.periods)
  next = log(next, message, tone)
  return { state: next, ok: true, message }
}

export function currentObjective(state: GameState) {
  return OBJECTIVES.find((objective) => !state.milestones.includes(objective.id))
}

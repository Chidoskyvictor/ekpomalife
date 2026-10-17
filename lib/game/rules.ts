import { ACTIONS, EVENTS, getLocation, START_LOCATION_ID } from './content'
import { CAREER_MAX_LEVEL, MUSIC_MAX_LEVEL, emptyDreamSnapshot, type DreamId } from './dreams'
import type { Appearance } from './look'
import { getLodging, type CharacterTypeId, type LodgingId } from './live'
import { applyNeeds, drainNeeds } from './needs'
import { hasTrait, type TraitId } from './traits'
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

export const PERIODS: TimePeriod[] = ['morning', 'afternoon', 'evening', 'night']

export const OBJECTIVES = [
  { id: 'buy_phone', label: 'Buy your phone at Campus Shop', locationId: 'campus_shop' },
  { id: 'first_errand', label: 'Run a campus errand at the Admin Block', locationId: 'aau_campus' },
  { id: 'first_meal', label: 'Eat at Mama Amina Bukka', locationId: 'roadside_bukka' },
] as const

export type ActionResult = { state: GameState; ok: boolean; message: string; event?: GameEvent }

export function createInitialState(
  name: string,
  username: string,
  avatarColor: string,
  appearance?: Appearance,
  traits?: TraitId[],
  dreamId?: DreamId | null,
  extras?: {
    characterType?: CharacterTypeId
    lodgingId?: LodgingId
    courseId?: string
    startingCash?: number
  },
): GameState {
  const lodging = getLodging(extras?.lodgingId)
  /** Cash must come from the server roll — never invent a client starter. */
  const cash = extras?.startingCash ?? 0
  return {
    playerId: crypto.randomUUID(),
    characterName: name,
    username,
    avatarColor,
    ...(appearance ? { appearance } : {}),
    ...(traits && traits.length > 0 ? { traits } : {}),
    dreamId: dreamId ?? null,
    ...(extras?.characterType ? { characterType: extras.characterType } : {}),
    ...(extras?.lodgingId ? { lodgingId: extras.lodgingId } : {}),
    ...(extras?.courseId ? { courseId: extras.courseId } : {}),
    dream: { ...emptyDreamSnapshot(), netWorth: cash },
    badges: [],
    dreamCompleted: false,
    dreamCelebrated: false,
    cash,
    energy: 100,
    health: 100,
    reputation: 0,
    academic: 50,
    hunger: 72,
    hygiene: 80,
    fun: 65,
    social: 58,
    xp: 12,
    locationId: lodging?.startLocationId ?? START_LOCATION_ID,
    day: 1,
    period: 'morning',
    hasPhone: false,
    milestones: [],
    feed: [
      {
        id: crypto.randomUUID(),
        text: `Welcome to Ekpoma, ${name}. ${lodging ? `${lodging.title}. ` : ''}₦${cash.toLocaleString()} in your pocket.`,
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
    dream: {
      ...(state.dream ?? emptyDreamSnapshot()),
      netWorth: Math.max(0, state.cash + (effects.cash ?? 0)),
    },
    energy: clamp(state.energy + (effects.energy ?? 0)),
    health: clamp(state.health + (effects.health ?? 0)),
    reputation: clamp(
      state.reputation +
        (effects.reputation
          ? effects.reputation < 0 && hasTrait(state.traits, 'social-butterfly')
            ? Math.ceil(effects.reputation / 2)
            : effects.reputation
          : 0),
    ),
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
  return drainNeeds({ ...state, day, period: PERIODS[index]! }, periods)
}

function log(state: GameState, text: string, tone: FeedTone): GameState {
  const entry = { id: crypto.randomUUID(), text, tone, day: state.day, period: state.period }
  return { ...state, feed: [entry, ...state.feed].slice(0, 40) }
}

function addMilestone(state: GameState, id: string): GameState {
  return state.milestones.includes(id) ? state : { ...state, milestones: [...state.milestones, id] }
}

function patchDream(state: GameState, patch: Partial<GameState['dream']>): GameState {
  const dream = {
    ...(state.dream ?? emptyDreamSnapshot()),
    ...patch,
    netWorth: state.cash,
    ownsLodge: Boolean(patch.ownsLodge ?? state.dream.ownsLodge) || state.cash >= 250_000,
  }
  return { ...state, dream }
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
    case 'study': {
      const academic =
        5 +
        (hasTrait(state.traits, 'tech') ? 2 : 0) +
        (hasTrait(state.traits, 'night-classer') ? 2 : 0) +
        (hasTrait(state.traits, 'academic-weapon') ? 2 : 0)
      const energy = -15 - (hasTrait(state.traits, 'night-classer') && state.period === 'morning' ? 4 : 0)
      next = applyEffects(next, { energy, academic })
      const cgpa = Math.min(
        5,
        next.dream.cgpa +
          0.04 +
          (hasTrait(state.traits, 'tech') ? 0.01 : 0) +
          (hasTrait(state.traits, 'academic-weapon') ? 0.01 : 0),
      )
      next = patchDream(next, {
        cgpa,
        graduated: next.dream.graduated || (next.academic >= 95 && next.day >= 8 && cgpa >= 3.5),
      })
      next = applyNeeds(next, { fun: -6, hunger: -5, hygiene: -2, xp: 8 })
      message = 'You read for hours. Academic standing up.'
      break
    }
    case 'night_class': {
      const academic =
        9 +
        (hasTrait(state.traits, 'night-classer') ? 4 : 0) +
        (hasTrait(state.traits, 'tech') ? 2 : 0) +
        (hasTrait(state.traits, 'academic-weapon') ? 4 : 0)
      next = applyEffects(next, { energy: -25, academic, health: -3 })
      const cgpa = Math.min(
        5,
        next.dream.cgpa +
          0.07 +
          (hasTrait(state.traits, 'night-classer') ? 0.02 : 0) +
          (hasTrait(state.traits, 'academic-weapon') ? 0.02 : 0),
      )
      next = patchDream(next, {
        cgpa,
        graduated: next.dream.graduated || (next.academic >= 95 && next.day >= 8 && cgpa >= 3.5),
      })
      next = applyNeeds(next, { fun: -8, hunger: -8, hygiene: -4, xp: 12 })
      message = 'TDB (till day break) reading. Your brain is full.'
      break
    }
    case 'socialize': {
      const reputation =
        3 +
        (hasTrait(state.traits, 'leader') ? 3 : 0) +
        (hasTrait(state.traits, 'fashionista') ? 3 : 0) +
        (hasTrait(state.traits, 'social-butterfly') ? 3 : 0)
      next = applyEffects(next, { energy: -8, reputation })
      next = applyNeeds(next, { fun: 18, social: 16, hunger: -4, xp: 4 })
      const bestFriends = Math.min(10, next.dream.bestFriends + (roll > 0.55 ? 1 : 0))
      next = patchDream(next, {
        bestFriends,
        facultyPresident: next.dream.facultyPresident || (next.reputation >= 80 && bestFriends >= 3),
      })
      message = 'You gisted and made new connections.'
      break
    }
    case 'rest': {
      const night = state.period === 'night' || state.period === 'evening'
      const energy = (night ? 60 : 30) - (hasTrait(state.traits, 'night-classer') ? 8 : 0)
      next = applyEffects(next, { energy, health: 8 })
      next = applyNeeds(next, { hygiene: night ? 25 : 8, fun: night ? 6 : 2, xp: night ? 8 : 3 })
      message = night ? 'You slept well. New day, new hustle.' : 'Short nap. You feel better.'
      if (night) next = advanceTime(next, state.period === 'night' ? 1 : 2)
      break
    }
    case 'eat': {
      const foodie = hasTrait(state.traits, 'foodie')
      const cash = foodie ? -1100 : -800
      const energy = foodie ? 22 : 15
      next = applyEffects(next, { cash, energy, health: 2 })
      next = applyNeeds(next, { hunger: foodie ? 45 : 35, fun: 4, xp: 3 })
      next = addMilestone(next, 'first_meal')
      message = foodie
        ? "Amina's jollof hit different. Belle first. +22 energy, extra ₦300."
        : "Amina's jollof hit different. +15 energy."
      break
    }
    case 'buy_phone':
      if (state.hasPhone) return fail(state, 'You already have a phone.')
      next = applyEffects({ ...next, hasPhone: true }, { cash: -2500 })
      next = addMilestone(next, 'buy_phone')
      message = 'New phone unlocked! Messages and town events now come to you.'
      break
    case 'buy_snack': {
      const foodie = hasTrait(state.traits, 'foodie')
      next = applyEffects(next, { cash: foodie ? -450 : -300, energy: foodie ? 10 : 6 })
      next = applyNeeds(next, { hunger: foodie ? 18 : 12, fun: 3, xp: 1 })
      message = foodie ? 'Gala and Fanta. Extra wrap, extra ₦150.' : 'Gala and Fanta. The student classic.'
      break
    }
    case 'errand': {
      const hustler = hasTrait(state.traits, 'hustler')
      const cash = hustler ? 750 : 500
      next = applyEffects(next, { cash, energy: -10, reputation: hustler ? 2 : 0 })
      next = addMilestone(next, 'first_errand')
      next = patchDream(next, {
        careerLevel: Math.min(CAREER_MAX_LEVEL, next.dream.careerLevel + (roll > (hustler ? 0.5 : 0.65) ? 1 : 0)),
      })
      message = hustler ? `You ran the errand and kept the customer. +₦${cash}.` : 'You ran an errand for a lecturer. +₦500.'
      break
    }
    case 'pos_shift': {
      const hustler = hasTrait(state.traits, 'hustler')
      const pay = 400 + Math.round((roll * 500) / 50) * 50 + (hustler ? 200 : 0)
      next = applyEffects(next, { cash: pay, energy: -20, reputation: hustler ? 2 : 0 })
      const started = next.dream.businessStarted || hasTrait(state.traits, 'tech') || hustler || roll > 0.85
      next = patchDream(next, {
        careerLevel: Math.min(CAREER_MAX_LEVEL, next.dream.careerLevel + (roll > (hustler ? 0.45 : 0.6) ? 1 : 0)),
        businessStarted: started,
        businessRevenue: started ? next.dream.businessRevenue + pay : next.dream.businessRevenue,
      })
      message = `POS shift done. You earned ₦${pay}.`
      break
    }
    case 'watch_match': {
      const risk = hasTrait(state.traits, 'risk-taker')
      const won = roll > (risk ? 0.28 : 0.5)
      next = applyEffects(next, {
        cash: risk ? (won ? 300 : -200) : -200,
        reputation: won ? (risk ? 4 : 2) : 2,
        energy: 4,
      })
      next = applyNeeds(next, { fun: 22, hunger: -3, xp: 4 })
      next = patchDream(next, {
        musicSkill: Math.min(MUSIC_MAX_LEVEL, next.dream.musicSkill + (roll > (risk ? 0.25 : 0.4) ? 1 : 0)),
      })
      message = won ? 'Your team won! The whole centre shouted.' : 'Draw. Everybody is arguing.'
      break
    }
    case 'pray':
      next = applyEffects(next, { health: 6, reputation: 1, energy: 4 })
      next = applyNeeds(next, { fun: 6, hygiene: 4, xp: 2 })
      message = 'Peace of mind restored.'
      break
    case 'market_run':
      next = applyEffects(next, { cash: -400, energy: 10 })
      next = applyNeeds(next, { hunger: 20, fun: 2, xp: 2 })
      message = 'You haggled well. Garri and groundnut secured.'
      break
    case 'feedback':
      next = applyEffects(next, { reputation: 1 })
      message = 'Thanks! The Ekpoma Life team logged your suggestion.'
      tone = 'neutral'
      break
    case 'workout': {
      const gym = hasTrait(state.traits, 'gym-rat')
      next = applyEffects(next, { energy: -15, health: gym ? 14 : 8, reputation: 1 })
      next = applyNeeds(next, { hygiene: -12, fun: 10, hunger: -8, xp: 5 })
      message = gym ? 'Leg day done. Fitness shot up.' : 'Laps around the pitch. Strong body, strong mind.'
      break
    }
  }

  if (actionId !== 'rest' && action.periods > 0) next = advanceTime(next, action.periods)
  next = log(next, message, tone)
  return { state: next, ok: true, message }
}

export function currentObjective(state: GameState) {
  return OBJECTIVES.find((objective) => !state.milestones.includes(objective.id))
}

export function resetDreamProgress(state: GameState, dreamId: DreamId | null): GameState {
  return {
    ...state,
    dreamId,
    dream: { ...emptyDreamSnapshot(), netWorth: state.cash, ownsLodge: state.cash >= 250_000 },
    dreamCompleted: false,
    dreamCelebrated: false,
  }
}

export function applyDreamReward(state: GameState, reward: { cash?: number; reputation?: number; badge: string }): GameState {
  if (state.dreamCompleted) return state
  const next = applyEffects(state, { cash: reward.cash ?? 0, reputation: reward.reputation ?? 0 })
  const badges = next.badges.includes(reward.badge) ? next.badges : [...next.badges, reward.badge]
  return { ...next, badges, dreamCompleted: true }
}

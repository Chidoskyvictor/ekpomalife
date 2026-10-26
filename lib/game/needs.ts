import type { GameState, TimePeriod } from './types'

export type NeedId = 'hunger' | 'energy' | 'fun' | 'social' | 'hygiene' | 'study'

export type NeedPatch = Partial<Record<'hunger' | 'hygiene' | 'fun' | 'social' | 'xp', number>>

const clamp = (value: number) => Math.max(0, Math.min(100, value))

export const NEED_META: Record<
  NeedId,
  {
    label: string
    tip: string
    emoji: string
    key: keyof Pick<GameState, 'hunger' | 'energy' | 'hygiene' | 'fun' | 'social' | 'academic'>
  }
> = {
  hunger: {
    label: 'Hunger',
    tip: 'You are hungry. Find a food stall',
    emoji: '/emoji/pot-of-food.png',
    key: 'hunger',
  },
  energy: {
    label: 'Energy',
    tip: 'You are tired. Rest or take a short nap',
    emoji: '/emoji/fire.png',
    key: 'energy',
  },
  fun: {
    label: 'Fun',
    tip: 'You are bored. Hang out or watch a match',
    emoji: '/emoji/party-popper.png',
    key: 'fun',
  },
  social: {
    label: 'Social',
    tip: 'Go chat with people. Campus is not for loners',
    emoji: '/emoji/handshake.png',
    key: 'social',
  },
  hygiene: {
    label: 'Hygiene',
    tip: 'Go bath. Fresh body, clear head',
    emoji: '/emoji/bed.png',
    key: 'hygiene',
  },
  study: {
    label: 'Study',
    tip: 'The books are calling. Hit the library',
    emoji: '/emoji/books.png',
    key: 'academic',
  },
}

export const NEED_GRID: NeedId[] = ['hunger', 'energy', 'fun', 'social', 'hygiene', 'study']

export function needValue(state: GameState, id: NeedId) {
  return state[NEED_META[id].key]
}

export function needTone(value: number): 'good' | 'warn' | 'bad' {
  if (value >= 55) return 'good'
  if (value >= 25) return 'warn'
  return 'bad'
}

export function applyNeeds(state: GameState, patch: NeedPatch): GameState {
  return {
    ...state,
    hunger: clamp(state.hunger + (patch.hunger ?? 0)),
    hygiene: clamp(state.hygiene + (patch.hygiene ?? 0)),
    fun: clamp(state.fun + (patch.fun ?? 0)),
    social: clamp(state.social + (patch.social ?? 0)),
    xp: Math.max(0, state.xp + (patch.xp ?? 0)),
  }
}

export function drainNeeds(state: GameState, periods: number): GameState {
  if (periods <= 0) return state
  return applyNeeds(state, {
    hunger: -6 * periods,
    hygiene: -4 * periods,
    fun: -5 * periods,
    social: -3 * periods,
    xp: 2 * periods,
  })
}

export function levelFromXp(xp: number) {
  const level = Math.max(1, Math.floor(xp / 100) + 1)
  const into = xp % 100
  return { level, progress: into / 100, into, next: 100 }
}

export function wellbeingScore(state: GameState) {
  return (
    (state.hunger + state.energy + state.hygiene + state.fun + state.social + state.academic) / 6
  )
}

export function moodFromNeeds(state: GameState) {
  const score = wellbeingScore(state)
  if (score >= 70) return { emoji: '😊', label: 'Happy', tone: 'good' as const }
  if (score >= 40) return { emoji: '😐', label: 'Meh', tone: 'warn' as const }
  return { emoji: '😔', label: 'Sad', tone: 'bad' as const }
}

/** Lowest critical need for avatar badge, or null. */
export function criticalNeed(state: GameState): NeedId | null {
  let worst: NeedId | null = null
  let worstValue = 25
  for (const id of NEED_GRID) {
    const value = needValue(state, id)
    if (value < worstValue) {
      worst = id
      worstValue = value
    }
  }
  return worst
}

export const PERIOD_CLOCK: Record<
  TimePeriod,
  { time: string; sky: 'sun' | 'moon'; hour: number; dayProgress: number; night: boolean }
> = {
  morning: { time: '8:12 AM', sky: 'sun', hour: 8, dayProgress: 0.2, night: false },
  afternoon: { time: '2:40 PM', sky: 'sun', hour: 14, dayProgress: 0.5, night: false },
  evening: { time: '7:18 PM', sky: 'moon', hour: 19, dayProgress: 0.78, night: true },
  night: { time: '11:26 PM', sky: 'moon', hour: 23, dayProgress: 0.95, night: true },
}

const WEEKDAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] as const

/** The game runs on real Nigerian time: day 1 = Thursday 15 Jan 2026 (mirrors backend time.ts). */
export function calendarForDay(day: number) {
  const offset = Math.max(1, day) - 1
  const weekday = WEEKDAYS[offset % 7]!
  const date = new Date(Date.UTC(2026, 0, 15 + offset)).getUTCDate()
  const weekend = weekday === 'Sat' || weekday === 'Sun'
  const rentDay = weekday === 'Sat'
  return { weekday, date, weekend, rentDay, label: `${weekday} ${date}` }
}

export function compactCount(value: number) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, '')}m`
  }
  if (value >= 1_000) {
    const thousands = value / 1_000
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(value)
}

export function compactMoney(value: number) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `₦${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (value >= 1_000) {
    const thousands = value / 1_000
    return `₦${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`
  }
  return `₦${Math.round(value).toLocaleString()}`
}

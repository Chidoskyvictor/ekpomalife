import type { TraitId } from './traits.js'

export type NeedId = 'hunger' | 'energy' | 'hygiene' | 'fun' | 'social' | 'study'

export type Needs = Record<NeedId, number>

/** Decay per in-game hour at baseline (points lost). */
export const BASE_DECAY_PER_GAME_HOUR: Needs = {
  hunger: 4,
  energy: 3,
  hygiene: 2,
  fun: 2.5,
  social: 2,
  study: 1.5,
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function defaultNeeds(): Needs {
  return { hunger: 80, energy: 80, hygiene: 80, fun: 70, social: 70, study: 50 }
}

export function clampNeeds(input: Partial<Needs> | null | undefined): Needs {
  const base = defaultNeeds()
  if (!input || typeof input !== 'object') return base
  return {
    hunger: clamp(typeof input.hunger === 'number' ? input.hunger : base.hunger),
    energy: clamp(typeof input.energy === 'number' ? input.energy : base.energy),
    hygiene: clamp(typeof input.hygiene === 'number' ? input.hygiene : base.hygiene),
    fun: clamp(typeof input.fun === 'number' ? input.fun : base.fun),
    social: clamp(typeof input.social === 'number' ? input.social : base.social),
    study: clamp(typeof input.study === 'number' ? input.study : base.study),
  }
}

/** Trait multipliers on decay (< 1 = slower drain). */
export function decayRatesForTraits(traits: TraitId[]): Needs {
  const rates = { ...BASE_DECAY_PER_GAME_HOUR }
  const has = (id: TraitId) => traits.includes(id)
  if (has('foodie')) rates.hunger *= 0.7
  if (has('gym-rat')) rates.energy *= 0.7
  if (has('fashionista')) rates.hygiene *= 0.75
  if (has('social-butterfly')) rates.social *= 0.7
  if (has('academic-weapon')) rates.study *= 0.65
  if (has('night-classer')) rates.energy *= 0.85
  if (has('hustler')) rates.fun *= 1.1
  return rates
}

export function decayNeeds(needs: Needs, gameMinutesElapsed: number, traits: TraitId[]): Needs {
  if (gameMinutesElapsed <= 0) return needs
  const hours = gameMinutesElapsed / 60
  const rates = decayRatesForTraits(traits)
  return clampNeeds({
    hunger: needs.hunger - rates.hunger * hours,
    energy: needs.energy - rates.energy * hours,
    hygiene: needs.hygiene - rates.hygiene * hours,
    fun: needs.fun - rates.fun * hours,
    social: needs.social - rates.social * hours,
    study: needs.study - rates.study * hours,
  })
}

export function applyNeedDelta(needs: Needs, delta: Partial<Needs>): Needs {
  return clampNeeds({
    hunger: needs.hunger + (delta.hunger ?? 0),
    energy: needs.energy + (delta.energy ?? 0),
    hygiene: needs.hygiene + (delta.hygiene ?? 0),
    fun: needs.fun + (delta.fun ?? 0),
    social: needs.social + (delta.social ?? 0),
    study: needs.study + (delta.study ?? 0),
  })
}

export function moodFromNeeds(needs: Needs) {
  const score =
    (needs.hunger + needs.energy + needs.hygiene + needs.fun + needs.social + needs.study) / 6
  if (score >= 70) return { emoji: '😊', label: 'Happy', tone: 'good' as const, score }
  if (score >= 40) return { emoji: '😐', label: 'Meh', tone: 'warn' as const, score }
  return { emoji: '😔', label: 'Sad', tone: 'bad' as const, score }
}

export function mostUrgentNeed(needs: Needs): NeedId {
  let worst: NeedId = 'hunger'
  let value = needs.hunger
  for (const id of Object.keys(needs) as NeedId[]) {
    if (needs[id] < value) {
      worst = id
      value = needs[id]
    }
  }
  return worst
}

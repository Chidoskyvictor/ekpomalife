import type { Appearance } from './look.js'
import type { TraitId } from './traits.js'

export type OnboardingStep = 'look' | 'traits' | 'dream' | 'live' | 'play'

export function onboardingStep(record: {
  appearance: Appearance | null
  traits: TraitId[]
  dreamId: string | null
  lodgingId?: string | null
  cashRolled?: boolean
}): OnboardingStep {
  if (!record.appearance) return 'look'
  if (record.traits.length !== 2) return 'traits'
  if (!record.dreamId) return 'dream'
  if (!record.lodgingId) return 'live'
  if (!record.cashRolled) return 'live'
  return 'play'
}

export function pathForStep(step: OnboardingStep) {
  if (step === 'look') return '/look'
  if (step === 'traits') return '/traits'
  if (step === 'dream') return '/dream'
  if (step === 'live') return '/live'
  return '/'
}

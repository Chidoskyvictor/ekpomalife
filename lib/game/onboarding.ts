import { normalizeAppearance, type Appearance } from './look'
import { normalizeDreamId, type DreamId } from './dreams'
import { normalizeTraits, type TraitId } from './traits'

export type OnboardingStep = 'look' | 'traits' | 'dream' | 'play'

export type CharacterRecord = {
  step: OnboardingStep
  appearance: Appearance | null
  traits: TraitId[]
  dreamId: DreamId | null
}

export function pathForStep(step: OnboardingStep) {
  if (step === 'look') return '/look'
  if (step === 'traits') return '/traits'
  if (step === 'dream') return '/dream'
  return '/'
}

export function localCharacterRecord(draft: {
  appearance?: unknown
  traits?: string[]
  dreamId?: string | null
} | null): CharacterRecord {
  const appearance = draft?.appearance ? normalizeAppearance(draft.appearance as Appearance) : null
  const traits = normalizeTraits(draft?.traits)
  const dreamId = normalizeDreamId(draft?.dreamId)
  const step: OnboardingStep = !appearance ? 'look' : traits.length !== 2 ? 'traits' : !dreamId ? 'dream' : 'play'
  return { step, appearance, traits, dreamId }
}

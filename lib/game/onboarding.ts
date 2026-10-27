import { normalizeAppearance, type Appearance } from './look'
import { normalizeDreamId, type DreamId } from './dreams'
import {
  normalizeCharacterType,
  normalizeCourseId,
  normalizeLodgingId,
  type CharacterTypeId,
  type LodgingId,
} from './live'
import { normalizeTraits, type TraitId } from './traits'

export type OnboardingStep = 'look' | 'traits' | 'dream' | 'live' | 'play'

export type CharacterRecord = {
  step: OnboardingStep
  appearance: Appearance | null
  traits: TraitId[]
  dreamId: DreamId | null
  characterType?: CharacterTypeId | null
  lodgingId?: LodgingId | null
  houseNumber?: number | null
  courseId?: string | null
  cash?: number
  startingCash?: number | null
  startingTier?: string | null
}

export function pathForStep(step: OnboardingStep) {
  if (step === 'look') return '/look'
  if (step === 'traits') return '/traits'
  if (step === 'dream') return '/dream'
  if (step === 'live') return '/live'
  return '/'
}

export function localCharacterRecord(draft: {
  appearance?: unknown
  traits?: string[]
  dreamId?: string | null
  characterType?: string | null
  lodgingId?: string | null
  courseId?: string | null
  startingCash?: number | null
  startingTier?: string | null
} | null): CharacterRecord {
  const appearance = draft?.appearance ? normalizeAppearance(draft.appearance as Appearance) : null
  const traits = normalizeTraits(draft?.traits)
  const dreamId = normalizeDreamId(draft?.dreamId)
  const characterType = normalizeCharacterType(draft?.characterType)
  const lodgingId = normalizeLodgingId(draft?.lodgingId)
  const courseId = normalizeCourseId(characterType, draft?.courseId)
  const cashRolled = typeof draft?.startingCash === 'number' && draft.startingCash > 0
  const step: OnboardingStep = !appearance
    ? 'look'
    : traits.length !== 2
      ? 'traits'
      : !dreamId
        ? 'dream'
        : !lodgingId || !cashRolled
          ? 'live'
          : 'play'
  return {
    step,
    appearance,
    traits,
    dreamId,
    characterType,
    lodgingId,
    courseId,
    startingCash: draft?.startingCash ?? null,
    startingTier: draft?.startingTier ?? null,
    cash: draft?.startingCash ?? 0,
  }
}

/** Prefer server character record for onboarding gates. */
export function recordFromServer(data: CharacterRecord): CharacterRecord {
  const appearance = data.appearance
  const traits = data.traits
  const dreamId = data.dreamId
  const lodgingId = data.lodgingId ?? null
  const cashRolled = typeof data.startingCash === 'number' && data.startingCash > 0
  const step: OnboardingStep = !appearance
    ? 'look'
    : traits.length !== 2
      ? 'traits'
      : !dreamId
        ? 'dream'
        : !lodgingId || !cashRolled
          ? 'live'
          : 'play'
  return { ...data, step, lodgingId, characterType: data.characterType ?? null }
}

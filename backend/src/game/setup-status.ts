import type { Appearance } from './look.js'
import { checkAppearance } from './look.js'
import { checkTraits, type TraitId } from './traits.js'

/** First unfinished character-creation step (look → traits → dream). */
export type SetupStep = 'look' | 'traits' | 'dream' | null

export type SetupStatus = {
  setupComplete: boolean
  /** First unfinished look/traits/dream step, or null if those three are done. */
  setupStep: SetupStep
}

export type CharacterSetupInput = {
  appearance: unknown
  traits: string[] | null | undefined
  dreamId: string | null | undefined
  lodgingId?: string | null
  /** True when a game_state row exists for this character. */
  hasGameState: boolean
}

function asAppearance(value: unknown): Appearance | null {
  const checked = checkAppearance(value)
  return checked.ok ? checked.value : null
}

function asTraits(value: string[] | null | undefined): TraitId[] {
  const checked = checkTraits(value ?? [])
  return checked.ok ? checked.value : []
}

/**
 * Setup is complete only when look + traits + dream are saved
 * and a game_state row exists (created via lodging setup + starting-money).
 */
export function computeSetupStatus(input: CharacterSetupInput): SetupStatus {
  const appearance = asAppearance(input.appearance)
  const traits = asTraits(input.traits)
  const dreamId = input.dreamId ?? null

  let setupStep: SetupStep = null
  if (!appearance) setupStep = 'look'
  else if (traits.length !== 2) setupStep = 'traits'
  else if (!dreamId) setupStep = 'dream'

  const setupComplete = setupStep === null && Boolean(input.hasGameState)
  return { setupComplete, setupStep }
}

export const SETUP_INCOMPLETE = 'SETUP_INCOMPLETE'

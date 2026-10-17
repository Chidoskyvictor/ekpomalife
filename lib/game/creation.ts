import { getAccount, getProfile, loadDraft, saveDraft, type LookDraft } from './accounts'
import { localCharacterRecord, type CharacterRecord } from './onboarding'
import type { Appearance } from './look'
import type { DreamId } from './dreams'
import type { CharacterTypeId, LodgingId } from './live'
import type { TraitId } from './traits'

export function loadCreation(username: string): CharacterRecord {
  return localCharacterRecord(loadDraft(username))
}

export function writeCreation(username: string, patch: LookDraft) {
  const draft = loadDraft(username)
  saveDraft(username, { ...draft, ...patch })
}

export function firstNameFor(username: string) {
  const name = getAccount(username)?.name ?? getProfile()?.name ?? username
  return name.trim().split(/\s+/)[0] || username
}

export function rememberLook(username: string, appearance: Appearance) {
  writeCreation(username, { appearance })
}

export function rememberTraits(username: string, appearance: Appearance, traits: TraitId[]) {
  writeCreation(username, { appearance, traits })
}

export function rememberDream(
  username: string,
  appearance: Appearance,
  traits: TraitId[],
  dreamId: DreamId,
) {
  writeCreation(username, { appearance, traits, dreamId })
}

export function rememberStartingMoney(username: string, startingCash: number, startingTier: string) {
  writeCreation(username, { startingCash, startingTier })
}

export function rememberLive(
  username: string,
  input: {
    appearance: Appearance
    traits: TraitId[]
    dreamId: DreamId | null
    characterType: CharacterTypeId
    lodgingId: LodgingId | null
    courseId?: string | null
  },
) {
  writeCreation(username, {
    appearance: input.appearance,
    traits: input.traits,
    dreamId: input.dreamId,
    characterType: input.characterType,
    lodgingId: input.lodgingId,
    courseId: input.courseId ?? null,
  })
}

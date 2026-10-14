export type TraitId = 'tech' | 'night-classer' | 'foodie' | 'leader'

export const TRAIT_LIMIT = 2
const ALLOWED = new Set<TraitId>(['tech', 'night-classer', 'foodie', 'leader'])

export type CheckResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function checkTraits(input: unknown): CheckResult<TraitId[]> {
  if (!Array.isArray(input)) return { ok: false, error: 'Pick two character traits.' }

  const unique: TraitId[] = []
  for (const id of input) {
    if (typeof id !== 'string' || !ALLOWED.has(id as TraitId)) {
      return { ok: false, error: 'That trait is not available.' }
    }
    if (unique.includes(id as TraitId)) return { ok: false, error: 'Pick two different traits.' }
    unique.push(id as TraitId)
  }

  if (unique.length !== TRAIT_LIMIT) return { ok: false, error: 'Pick exactly two traits.' }
  return { ok: true, value: unique }
}

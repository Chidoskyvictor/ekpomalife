import type { NeedId } from './needs'

export type NeedsMap = Record<NeedId, number>

export function defaultNeeds(): NeedsMap {
  return { hunger: 80, energy: 80, hygiene: 80, fun: 70, social: 70, study: 50 }
}

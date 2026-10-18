export type LodgingId = 'hostel-poultry' | 'selfcon-oxford' | 'selfcon-g2' | 'onebed-ojo'

/** Eviction target — Off-campus Hostels (cheaper than selfcon-g2 / onebed). */
export const EVICTION_LODGING_ID: LodgingId = 'selfcon-oxford'

export const LODGE_DEED_ITEM_ID = 'lodge-deed'

/** Weekly landlord income when lodge-deed is owned (ledger kind `rent`, positive). */
export const LODGE_INCOME_WEEKLY = 8_000

const RENT_WEEKLY: Record<LodgingId, number> = {
  'hostel-poultry': 1200,
  'selfcon-oxford': 2500,
  'selfcon-g2': 3000,
  'onebed-ojo': 10_500,
}

/** Needs drain multiplier (>1 = worse). Eviction lodging drains faster. */
const DECAY_MULT: Record<LodgingId, number> = {
  'hostel-poultry': 1,
  'selfcon-oxford': 1.35,
  'selfcon-g2': 1.1,
  'onebed-ojo': 1,
}

export function rentWeeklyForLodging(lodgingId: string | null | undefined): number {
  if (!lodgingId) return RENT_WEEKLY['hostel-poultry']
  return RENT_WEEKLY[lodgingId as LodgingId] ?? RENT_WEEKLY['hostel-poultry']
}

export function normalizeLodgingId(lodgingId: string | null | undefined): LodgingId {
  if (lodgingId && lodgingId in RENT_WEEKLY) return lodgingId as LodgingId
  return 'hostel-poultry'
}

export function lodgingDecayMultiplier(lodgingId: string | null | undefined): number {
  const id = normalizeLodgingId(lodgingId)
  return DECAY_MULT[id] ?? 1
}

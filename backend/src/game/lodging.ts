export type LodgingId = 'hostel-poultry' | 'single-poultry' | 'selfcon-g2' | 'onebed-ojo'

/** Eviction target — Off-campus Hostels (cheaper than selfcon-g2 / onebed). */
export const EVICTION_LODGING_ID: LodgingId = 'single-poultry'

export const LODGE_DEED_ITEM_ID = 'lodge-deed'

/** Weekly landlord income when lodge-deed is owned (ledger kind `rent`, positive). */
export const LODGE_INCOME_WEEKLY = 8_000

const RENT_WEEKLY: Record<LodgingId, number> = {
  'hostel-poultry': 1200,
  'single-poultry': 2500,
  'selfcon-g2': 3000,
  'onebed-ojo': 10_500,
}

/**
 * Rent paid in advance when you move in, taken from the starting money. A house you can't cover
 * after the spin is locked. Keep in sync with `moveInFee` in lib/game/live.ts.
 */
const MOVE_IN_FEE: Record<LodgingId, number> = {
  'hostel-poultry': 0,
  'single-poultry': 150_000,
  'selfcon-g2': 250_000,
  'onebed-ojo': 400_000,
}

export function moveInFeeFor(lodgingId: string | null | undefined): number {
  return MOVE_IN_FEE[normalizeLodgingId(lodgingId)]
}

/** Needs drain multiplier (>1 = worse). Eviction lodging drains faster. */
const DECAY_MULT: Record<LodgingId, number> = {
  'hostel-poultry': 1,
  'single-poultry': 1.35,
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

/** Self-con and one bedroom have their own kitchen; the single room and hostel don't. */
export function lodgingHasKitchen(lodgingId: string | null | undefined): boolean {
  const id = normalizeLodgingId(lodgingId)
  return id === 'selfcon-g2' || id === 'onebed-ojo'
}

export function lodgingDecayMultiplier(lodgingId: string | null | undefined): number {
  const id = normalizeLodgingId(lodgingId)
  return DECAY_MULT[id] ?? 1
}

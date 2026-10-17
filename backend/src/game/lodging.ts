export type LodgingId = 'hostel-poultry' | 'selfcon-oxford' | 'selfcon-g2' | 'onebed-ojo'

const RENT_WEEKLY: Record<LodgingId, number> = {
  'hostel-poultry': 1200,
  'selfcon-oxford': 2500,
  'selfcon-g2': 3000,
  'onebed-ojo': 10_500,
}

export function rentWeeklyForLodging(lodgingId: string | null | undefined): number {
  if (!lodgingId) return RENT_WEEKLY['hostel-poultry']
  return RENT_WEEKLY[lodgingId as LodgingId] ?? RENT_WEEKLY['hostel-poultry']
}

export function normalizeLodgingId(lodgingId: string | null | undefined): LodgingId {
  if (lodgingId && lodgingId in RENT_WEEKLY) return lodgingId as LodgingId
  return 'hostel-poultry'
}

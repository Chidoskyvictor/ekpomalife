/** Lodging ids the Buy-mode grid is keyed by (same ids as the API's normalizeLodgingId). */
const KNOWN = new Set(['hostel-poultry', 'single-poultry', 'selfcon-g2', 'onebed-ojo'])

export function normalizeLodging(lodgingId: string | null | undefined) {
  return lodgingId && KNOWN.has(lodgingId) ? lodgingId : 'hostel-poultry'
}

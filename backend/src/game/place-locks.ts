/**
 * Places locked until a real moment (launch events). Nobody can walk, ride or act there before then.
 */
export const PLACE_LOCKS: Record<string, { until: string; message: string }> = {
  // Sazza opens at 10 pm Lagos time on launch night (21:00 UTC)
  sazza: { until: '2026-11-07T21:00:00Z', message: 'Sazza opens tonight at 10pm. See you there!' },
}

/** The lock message if this place is still locked now, else null. */
export function placeLock(placeId: string | null | undefined, now = Date.now()): string | null {
  const lock = placeId ? PLACE_LOCKS[placeId] : undefined
  return lock && now < Date.parse(lock.until) ? lock.message : null
}

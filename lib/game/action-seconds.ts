/**
 * How long an action takes on screen, in real seconds. Actions are written with "real life"
 * minutes (a 90-minute lecture, a 4-hour sleep); in the game nothing takes more than a minute.
 * Short things stay quick, long things land between 30 and 60 seconds.
 * 5 min → 10s, 15 → 15s, 30 → 21s, 60 → 29s, 90 → 36s, 240 → 59s
 */
export const MAX_ACTION_SECONDS = 60

export function actionSeconds(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 5
  const seconds = Math.round(2 + 4 * Math.sqrt(minutes) - 0.6 * Math.log2(minutes))
  return Math.max(5, Math.min(MAX_ACTION_SECONDS, seconds))
}

export const secondsLabel = (seconds: number) => `${seconds}s`

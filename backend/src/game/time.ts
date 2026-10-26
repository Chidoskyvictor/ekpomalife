/**
 * The game runs on the real clock: Nigerian time (WAT, UTC+1), the same for every player.
 * Sleeping, working or anything else never moves it; it just ticks like real life.
 * Game time = minutes since day 1, Thursday 15 Jan 2026, 00:00 WAT.
 */
export const REAL_TO_GAME_MINUTES = 1

/** Minutes in one in-game day. */
export const DAY_MINUTES = 24 * 60

/** Day 1 00:00 WAT (= 14 Jan 2026 23:00 UTC). */
export const GAME_EPOCH_MS = Date.UTC(2026, 0, 14, 23, 0, 0)

/** The game clock right now (real WAT time), in minutes since day 1. */
export function realGameTime(now: number | Date = Date.now()): number {
  if (testGameTime != null) return testGameTime
  const ms = typeof now === 'number' ? now : now.getTime()
  return Math.max(0, Math.floor((ms - GAME_EPOCH_MS) / 60_000))
}

let testGameTime: number | null = null
/** Tests only: pin "now" to a game time (e.g. 23:00 on day 1) instead of the real clock; null to unpin. */
export function setTestGameTime(gameTime: number | null) {
  testGameTime = gameTime
}

/** Real date for a game day (day 1 = 15 Jan 2026). */
export function realDateForDay(day: number): Date {
  return new Date(GAME_EPOCH_MS + (Math.max(1, day) - 1) * DAY_MINUTES * 60_000 + 60 * 60_000)
}

/** @deprecated new players start on the real clock (realGameTime). */
export const DEFAULT_GAME_TIME = 8 * 60

export function advanceGameTime(gameTime: number, realMsElapsed: number): number {
  if (realMsElapsed <= 0) return gameTime
  const realMinutes = realMsElapsed / 60_000
  const added = Math.floor(realMinutes * REAL_TO_GAME_MINUTES)
  return gameTime + Math.max(0, added)
}

export function clockFromGameTime(gameTime: number) {
  const day = Math.floor(gameTime / DAY_MINUTES) + 1
  const tod = ((gameTime % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const hour = Math.floor(tod / 60)
  const minute = tod % 60
  const period =
    hour >= 5 && hour < 12
      ? ('morning' as const)
      : hour >= 12 && hour < 17
        ? ('afternoon' as const)
        : hour >= 17 && hour < 21
          ? ('evening' as const)
          : ('night' as const)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const timeLabel = `${h12}:${String(minute).padStart(2, '0')} ${ampm}`
  return { day, hour, minute, period, timeLabel, tod }
}

export type OpenHours = { open: number; close: number }

/** Hour-of-day open window. close can be < open for overnight (e.g. 22–6). */
export function isOpenAt(hours: OpenHours | null | undefined, hour: number): boolean {
  if (!hours) return true
  const { open, close } = hours
  if (open === close) return true
  if (open < close) return hour >= open && hour < close
  return hour >= open || hour < close
}

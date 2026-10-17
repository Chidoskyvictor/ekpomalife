/** 1 real minute = 10 in-game minutes. */
export const REAL_TO_GAME_MINUTES = 10

/** Minutes in one in-game day. */
export const DAY_MINUTES = 24 * 60

/** Default start: 8:00 AM day 1. */
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

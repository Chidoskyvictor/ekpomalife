import { useEffect, useState } from 'react'
import type { TimePeriod } from './types'

/*
 * The game runs on real Nigerian time (WAT, UTC+1) for everyone, the same clock the server uses.
 * This ticks it on the device so the HUD clock, the sky and the room light move without waiting
 * for a server refresh. In development, `?time=21:30` pins it to check night / morning looks.
 */

const WAT_OFFSET_MS = 60 * 60_000

/** Minute of the day in WAT (0–1439). */
export function watMinuteOfDay(ms = Date.now()) {
  return Math.floor((((ms + WAT_OFFSET_MS) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000)
}

/** Dev only: `?time=21:30` (or the older `?roomTime=`) pins the clock. Minute of day, or null. */
export function devPinnedMinute(search: string): number | null {
  if (process.env.NODE_ENV !== 'development') return null
  const params = new URLSearchParams(search)
  const raw = params.get('time') ?? params.get('roomTime')
  const match = raw?.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  return (Number(match[1]) % 24) * 60 + Math.min(59, Number(match[2]))
}

/** Same bands as the server (backend time.ts clockFromGameTime). */
export function periodForMinute(minute: number): TimePeriod {
  const hour = Math.floor(minute / 60)
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

export function labelForMinute(minute: number) {
  const hour = Math.floor(minute / 60)
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

/** The live WAT clock (re-renders every 20 s). */
export function useWatClock() {
  const [pinned, setPinned] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setPinned(devPinnedMinute(window.location.search))
    const id = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(id)
  }, [])
  const minute = pinned ?? watMinuteOfDay(now)
  return { minute, period: periodForMinute(minute), timeLabel: labelForMinute(minute), pinned: pinned != null }
}

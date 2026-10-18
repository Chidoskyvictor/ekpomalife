import { DAY_MINUTES, clockFromGameTime } from './time.js'

/** Match frontend `lib/game/needs.ts` calendarForDay (day 1 = Thursday). */
const WEEKDAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] as const

export type Weekday = (typeof WEEKDAYS)[number]

export function calendarForDay(day: number) {
  const offset = Math.max(1, day) - 1
  const weekday = WEEKDAYS[offset % 7]!
  const date = ((14 + offset) % 31) + 1
  const weekend = weekday === 'Sat' || weekday === 'Sun'
  const rentDay = weekday === 'Sat'
  return { weekday, date, weekend, rentDay, label: `${weekday} ${date}` }
}

/** 0-based week index (days 1–7 → week 0). */
export function gameWeekFromDay(day: number): number {
  return Math.floor((Math.max(1, day) - 1) / 7)
}

/** Absolute game day of Monday in week `week` (week 0 Monday = day 5). */
export function mondayDayForWeek(week: number): number {
  return 5 + week * 7
}

/** Absolute game day of Saturday (rent day) in week `week` (week 0 Sat = day 3). */
export function rentDayForWeek(week: number): number {
  return 3 + week * 7
}

export function dayFromGameTime(gameTime: number): number {
  return clockFromGameTime(gameTime).day
}

/** Next Saturday on or after `day`. */
export function nextRentDay(day: number): number {
  const cal = calendarForDay(day)
  if (cal.rentDay) return day
  const offset = Math.max(1, day) - 1
  const weekdayIndex = offset % 7
  // Sat is index 2 in WEEKDAYS
  const daysUntilSat = (2 - weekdayIndex + 7) % 7
  return day + (daysUntilSat === 0 ? 7 : daysUntilSat)
}

/** ISO-ish display timestamp derived from game day (not wall clock). Stable for API. */
export function displayDateForGameDay(day: number): string {
  // Anchor: game day 1 → 2026-01-15 (Thu) UTC noon
  const ms = Date.UTC(2026, 0, 15 + (Math.max(1, day) - 1), 12, 0, 0)
  return new Date(ms).toISOString()
}

export function gameMinutesUntilDay(gameTime: number, targetDay: number): number {
  const targetStart = (Math.max(1, targetDay) - 1) * DAY_MINUTES
  return Math.max(0, targetStart - gameTime)
}

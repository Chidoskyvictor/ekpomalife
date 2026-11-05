import { describe, expect, it } from 'vitest'
import { BUSINESS_SUMMARY_HOUR, formatBusinessSummary, summaryDayFor, totalsFromEvents } from './invest.js'
import { DAY_MINUTES } from './time.js'

describe('business daily summary', () => {
  it('is due at 9 PM for today, otherwise reports yesterday', () => {
    const day3 = 2 * DAY_MINUTES
    expect(summaryDayFor(day3 + BUSINESS_SUMMARY_HOUR * 60)).toBe(3)
    expect(summaryDayFor(day3 + BUSINESS_SUMMARY_HOUR * 60 - 1)).toBe(2)
    expect(summaryDayFor(day3)).toBe(2)
  })

  it('totals made and spent and ignores other invest events', () => {
    const t = totalsFromEvents([
      { kind: 'business_income', amount: 5000 },
      { kind: 'business_income', amount: 2500 },
      { kind: 'business_loss', amount: -3000 },
      { kind: 'land_growth', amount: 99_999 },
    ])
    expect(t).toEqual({ made: 7500, spent: 3000, count: 3 })
  })

  it('has a stable per-day id so a day is only notified once', () => {
    const a = formatBusinessSummary(4, 7500, 3000)
    expect(a.id).toBe(formatBusinessSummary(4, 1, 1).id)
    expect(a.id).not.toBe(formatBusinessSummary(5, 7500, 3000).id)
    expect(a.body).toContain('7,500')
    expect(a.body).toContain('3,000')
  })
})

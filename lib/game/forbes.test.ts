import { describe, expect, it } from 'vitest'
import { mergePage, meLabel, podiumOrder, updatedLabel, type ForbesEntry } from './forbes'

const e = (rank: number): ForbesEntry => ({ rank, userId: `u${rank}`, username: `p${rank}`, displayName: `P${rank}`, netWorth: 100 - rank, detail: '', appearance: null, avatarColor: '#000' })

describe('forbes helpers', () => {
  it('puts #1 in the middle of the podium', () => {
    expect(podiumOrder([e(1), e(2), e(3)]).map((x) => x.rank)).toEqual([2, 1, 3])
    expect(podiumOrder([e(1)]).map((x) => x.rank)).toEqual([1])
    expect(podiumOrder([])).toEqual([])
  })
  it('labels freshness', () => {
    const t = Date.parse('2026-01-01T00:10:00Z')
    expect(updatedLabel('2026-01-01T00:09:40Z', t)).toBe('Updated just now')
    expect(updatedLabel('2026-01-01T00:07:00Z', t)).toBe('Updated 3 min ago')
  })
  it('merges pages without repeats, in rank order', () => {
    const merged = mergePage([e(1), e(2)], [e(2), e(3), e(4)])
    expect(merged.map((x) => x.rank)).toEqual([1, 2, 3, 4])
  })
  it('words the rank bar', () => {
    expect(meLabel(47, 232, '₦3.2m')).toBe('You · #47 of 232 · ₦3.2m')
  })
})

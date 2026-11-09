import { describe, expect, it } from 'vitest'
import { podiumOrder, updatedLabel, type ForbesEntry } from './forbes'

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
})

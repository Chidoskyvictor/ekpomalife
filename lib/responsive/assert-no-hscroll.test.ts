import { describe, expect, it } from 'vitest'
import { hasHorizontalOverflow } from './assert-no-hscroll'

describe('hasHorizontalOverflow', () => {
  it('passes when scrollWidth fits the viewport', () => {
    expect(hasHorizontalOverflow(375, 375)).toBe(false)
    expect(hasHorizontalOverflow(376, 375)).toBe(false) // 1px slack
  })

  it('fails when content is wider than the viewport', () => {
    expect(hasHorizontalOverflow(400, 375)).toBe(true)
  })
})

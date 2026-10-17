import { describe, expect, it } from 'vitest'
import { setupBodySchema } from './setup.js'

describe('setupBodySchema', () => {
  it('accepts graduate with a selfcon lodge', () => {
    const parsed = setupBodySchema.safeParse({
      characterType: 'graduate',
      lodgingId: 'selfcon-oxford',
      courseId: null,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts graduate in AAU hostel when a course is picked', () => {
    const parsed = setupBodySchema.safeParse({
      characterType: 'graduate',
      lodgingId: 'hostel-poultry',
      courseId: 'computer-science',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects AAU hostel without a course for any character type', () => {
    const parsed = setupBodySchema.safeParse({
      characterType: 'graduate',
      lodgingId: 'hostel-poultry',
    })
    expect(parsed.success).toBe(false)
  })
})

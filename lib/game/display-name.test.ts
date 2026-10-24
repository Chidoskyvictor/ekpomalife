import { describe, expect, it } from 'vitest'
import { validateDisplayName } from './display-name'

describe('validateDisplayName (client)', () => {
  it('matches server rules for length', () => {
    expect(validateDisplayName('Ekpoma Star').ok).toBe(true)
    expect(validateDisplayName('x').ok).toBe(false)
  })
})

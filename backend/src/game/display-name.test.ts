import { describe, expect, it } from 'vitest'
import { validateDisplayName } from './display-name.js'

describe('validateDisplayName', () => {
  it('accepts friendly campus names', () => {
    expect(validateDisplayName('Ada Lovelace')).toEqual({ ok: true, name: 'Ada Lovelace' })
  })

  it('rejects short names', () => {
    expect(validateDisplayName('ab').ok).toBe(false)
  })

  it('rejects blocked language', () => {
    expect(validateDisplayName('badword bitch').ok).toBe(false)
  })
})

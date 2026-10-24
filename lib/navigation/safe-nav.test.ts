import { describe, expect, it } from 'vitest'
import { pathsEqual } from './safe-nav'

describe('pathsEqual', () => {
  it('treats trailing slashes as the same path', () => {
    expect(pathsEqual('/', '/')).toBe(true)
    expect(pathsEqual('/login', '/login')).toBe(true)
    expect(pathsEqual('/room', '/room/')).toBe(true)
  })
})

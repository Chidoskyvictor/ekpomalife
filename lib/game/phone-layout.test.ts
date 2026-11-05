import { describe, expect, it } from 'vitest'
import type { PhoneAppId } from './phone'
import { DEFAULT_DOCK, moveApp, pinApp, resolveLayout, unpinApp } from './phone-layout'

const ALL = ['messages', 'bank', 'ride', 'market', 'jobs', 'map', 'invest'] as PhoneAppId[]

describe('phone layout', () => {
  it('defaults to the standard dock', () => {
    const l = resolveLayout(null, ALL)
    expect(l.dock).toEqual(DEFAULT_DOCK)
    expect(l.grid).toEqual(['jobs', 'map', 'invest'])
  })

  it('repairs saved data: drops unknown/duplicates, appends new apps', () => {
    const l = resolveLayout({ dock: ['jobs', 'jobs', 'nope'], grid: ['map'] }, ALL)
    expect(l.dock).toEqual(['jobs'])
    expect(l.grid).toEqual(['map', 'messages', 'bank', 'ride', 'market', 'invest'])
  })

  it('pins, refuses a fifth dock app, unpins and reorders', () => {
    const l = resolveLayout(null, ALL)
    expect(pinApp(l, 'jobs')).toBeNull()
    const un = unpinApp(l, 'bank')
    expect(un.grid.at(-1)).toBe('bank')
    const pinned = pinApp(un, 'jobs')!
    expect(pinned.dock).toEqual(['messages', 'ride', 'market', 'jobs'])
    expect(moveApp(pinned, 'jobs', -1).dock).toEqual(['messages', 'ride', 'jobs', 'market'])
    expect(moveApp(pinned, 'messages', -1)).toBe(pinned)
    expect(moveApp(un, 'map', 1).grid.slice(0, 3)).toEqual(['jobs', 'invest', 'map'])
  })
})

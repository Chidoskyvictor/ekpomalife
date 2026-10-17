import { describe, expect, it } from 'vitest'
import { ACTIONS, getAction } from './actions.js'
import { getPlace } from './places.js'
import { clockFromGameTime, isOpenAt } from './time.js'

function canPerform(opts: {
  actionId: string
  locationId: string
  cash: number
  gameTime: number
}): { ok: true } | { ok: false; reason: string } {
  const action = getAction(opts.actionId)
  if (!action) return { ok: false, reason: 'unknown' }
  const place = getPlace(opts.locationId)
  if (!place) return { ok: false, reason: 'unknown place' }
  if (!place.actions.includes(action.id)) return { ok: false, reason: 'wrong place' }
  const clock = clockFromGameTime(opts.gameTime)
  if (!isOpenAt(place.openHours, clock.hour)) return { ok: false, reason: 'closed' }
  if (action.cost < 0 && opts.cash < Math.abs(action.cost)) return { ok: false, reason: 'cannot afford' }
  return { ok: true }
}

describe('action validation', () => {
  it('rejects when you cannot afford eat', () => {
    const result = canPerform({
      actionId: 'eat',
      locationId: 'bukka',
      cash: 100,
      gameTime: 12 * 60,
    })
    expect(result).toEqual({ ok: false, reason: 'cannot afford' })
  })

  it('rejects eat at the wrong place', () => {
    const result = canPerform({
      actionId: 'eat',
      locationId: 'admin-block',
      cash: 50_000,
      gameTime: 12 * 60,
    })
    expect(result).toEqual({ ok: false, reason: 'wrong place' })
  })

  it('rejects when place is closed', () => {
    const result = canPerform({
      actionId: 'study',
      locationId: 'admin-block',
      cash: 50_000,
      gameTime: 23 * 60,
    })
    expect(result).toEqual({ ok: false, reason: 'closed' })
  })

  it('allows eat at bukka when open and funded', () => {
    const result = canPerform({
      actionId: 'eat',
      locationId: 'bukka',
      cash: 50_000,
      gameTime: 12 * 60,
    })
    expect(result).toEqual({ ok: true })
  })

  it('defines all seven core actions', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      ['eat', 'hangout', 'shower', 'sleep', 'study', 'travel', 'work-placeholder'].sort(),
    )
  })
})

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export type MeFixture = {
  setupComplete: boolean
  setupStep: 'look' | 'traits' | 'dream' | null
  account?: { name: string; username: string }
}

/** Mutable fixture bag — handlers read this object (not a rebinding). */
export const fixtures = {
  me: null as MeFixture | null,
  gameStateStatus: 409 as 200 | 401 | 409,
}

export function setAuthMe(next: MeFixture | null) {
  fixtures.me = next
}

export function setGameStateStatus(status: 200 | 401 | 409) {
  fixtures.gameStateStatus = status
}

export function resetFixtures() {
  fixtures.me = null
  fixtures.gameStateStatus = 409
}

export const server = setupServer(
  // Local `/api/*` proxy and production `https://api…/*` (optional `/api` prefix).
  http.get(/\/(?:api\/)?auth\/me$/, () => {
    const me = fixtures.me
    if (!me) return HttpResponse.json({ ok: false, error: 'Log in.' }, { status: 401 })
    return HttpResponse.json({
      ok: true,
      account: me.account ?? { name: 'Test', username: 'tester' },
      setupComplete: me.setupComplete,
      setupStep: me.setupStep,
    })
  }),
  http.get(/\/(?:api\/)?game\/state$/, () => {
    if (fixtures.gameStateStatus === 401) {
      return HttpResponse.json({ ok: false, error: 'Log in to play.' }, { status: 401 })
    }
    if (fixtures.gameStateStatus === 409) {
      return HttpResponse.json({ ok: false, error: 'SETUP_INCOMPLETE' }, { status: 409 })
    }
    return HttpResponse.json({
      ok: true,
      cash: 12000,
      needs: { hunger: 70, energy: 70, hygiene: 70, fun: 70, social: 70, study: 50 },
      locationId: 'hostel-poultry',
      gameTime: 0,
      day: 1,
      period: 'morning',
      timeLabel: 'Day 1 · Morning',
      mood: { emoji: '🙂', label: 'Fine', tone: 'good', score: 70 },
      dreamProgress: null,
      upNext: { actionId: 'eat', placeId: 'canteen', need: 'hunger', label: 'Eat' },
      version: 1,
      places: [],
    })
  }),
)

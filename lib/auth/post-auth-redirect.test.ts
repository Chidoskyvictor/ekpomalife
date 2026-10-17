import { describe, expect, it } from 'vitest'
import { fetchGameState } from '@/lib/game/game-api'
import { setAuthMe, setGameStateStatus } from '../../vitest.msw'
import { fetchAuthMe } from './fetch-auth-me'
import { getPostAuthRoute, resolveGate } from './post-auth-redirect'

describe('getPostAuthRoute', () => {
  it('sends logged-out users to login', () => {
    expect(getPostAuthRoute(null)).toBe('/login')
  })

  it('after signup quit before setup → Look (password-reset then login path)', () => {
    // Signup → quit → forgot → reset → login: /auth/me says incomplete at look
    const user = { setupComplete: false, setupStep: 'look' as const }
    expect(getPostAuthRoute(user)).toBe('/look')
  })

  it('partial progress saved at Traits → Traits', () => {
    expect(getPostAuthRoute({ setupComplete: false, setupStep: 'traits' })).toBe('/traits')
  })

  it('completed user after reset + login → home', () => {
    expect(getPostAuthRoute({ setupComplete: true, setupStep: null })).toBe('/')
  })

  it('character done but no game_state → live', () => {
    expect(getPostAuthRoute({ setupComplete: false, setupStep: null })).toBe('/live')
  })
})

describe('AuthGate resolveGate', () => {
  it('visiting / (home) while setup incomplete redirects to setup', () => {
    const dest = resolveGate('home', '/', {
      setupComplete: false,
      setupStep: 'look',
    })
    expect(dest).toBe('/look')
  })

  it('visiting / while at traits redirects to /traits', () => {
    expect(
      resolveGate('home', '/', { setupComplete: false, setupStep: 'traits' }),
    ).toBe('/traits')
  })

  it('complete user on setup is sent home', () => {
    expect(resolveGate('setup', '/look', { setupComplete: true, setupStep: null })).toBe('/')
  })

  it('logged-in incomplete user on /login is sent to setup', () => {
    expect(
      resolveGate('public', '/login', { setupComplete: false, setupStep: 'dream' }),
    ).toBe('/dream')
  })

  it('allows going back from /live to /dream before setup is complete', () => {
    expect(
      resolveGate('setup', '/dream', { setupComplete: false, setupStep: null }),
    ).toBeNull()
  })

  it('blocks skipping ahead from /look to /live when traits are unfinished', () => {
    expect(
      resolveGate('setup', '/live', { setupComplete: false, setupStep: 'traits' }),
    ).toBe('/traits')
  })
})

describe('MSW auth + game gate', () => {
  it('login after reset with unfinished Look lands on Look via /auth/me', async () => {
    setAuthMe({ setupComplete: false, setupStep: 'look' })
    const me = await fetchAuthMe()
    expect(me).toEqual({ setupComplete: false, setupStep: 'look' })
    expect(getPostAuthRoute(me)).toBe('/look')
  })

  it('login after reset with Traits progress lands on Traits', async () => {
    setAuthMe({ setupComplete: false, setupStep: 'traits' })
    const me = await fetchAuthMe()
    expect(getPostAuthRoute(me)).toBe('/traits')
  })

  it('completed user lands on home', async () => {
    setAuthMe({ setupComplete: true, setupStep: null })
    setGameStateStatus(200)
    const me = await fetchAuthMe()
    expect(getPostAuthRoute(me)).toBe('/')
  })

  it('/game/state returns SETUP_INCOMPLETE for unfinished users', async () => {
    setAuthMe({ setupComplete: false, setupStep: 'look' })
    setGameStateStatus(409)
    const state = await fetchGameState()
    expect(state.ok).toBe(false)
    if (!state.ok) expect(state.error).toBe('SETUP_INCOMPLETE')
  })
})

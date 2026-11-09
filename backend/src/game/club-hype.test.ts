import { describe, expect, it } from 'vitest'
import { HYPE_PAIR_COOLDOWN_MS, HYPE_TIERS } from './club-hype.js'
import { cleanHttpsUrl } from './promoted-songs.js'

describe('hype tiers', () => {
  it('prices match the economy scale', () => {
    expect(HYPE_TIERS.hype.price).toBe(5_000_000)
    expect(HYPE_TIERS.mega.price).toBe(15_000_000)
    expect(HYPE_TIERS.round.price).toBe(100_000_000)
    expect(HYPE_TIERS.shutdown.price).toBe(1_000_000_000)
  })

  it('only hype and mega need a target and reward the hyped player', () => {
    expect(HYPE_TIERS.hype.target && HYPE_TIERS.mega.target).toBe(true)
    expect(HYPE_TIERS.round.target || HYPE_TIERS.shutdown.target).toBe(false)
    expect(HYPE_TIERS.hype.reward?.social).toBeGreaterThan(0)
    expect(HYPE_TIERS.round.reward).toBeNull()
  })

  it('the same pair has a cooldown', () => {
    expect(HYPE_PAIR_COOLDOWN_MS).toBeGreaterThanOrEqual(60_000)
  })
})

describe('cleanHttpsUrl (promoted song links)', () => {
  it('accepts https links', () => {
    expect(cleanHttpsUrl('https://open.spotify.com/track/abc')).toBe('https://open.spotify.com/track/abc')
  })

  it('rejects http, javascript:, data:, credentials and junk', () => {
    expect(cleanHttpsUrl('http://example.com/x')).toBeNull()
    expect(cleanHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(cleanHttpsUrl('data:text/html,hi')).toBeNull()
    expect(cleanHttpsUrl('https://user:pass@example.com/x')).toBeNull()
    expect(cleanHttpsUrl('not a url')).toBeNull()
    expect(cleanHttpsUrl('')).toBeNull()
    expect(cleanHttpsUrl(42)).toBeNull()
    expect(cleanHttpsUrl(`https://example.com/${'a'.repeat(600)}`)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { computeSetupStatus, SETUP_INCOMPLETE } from './setup-status.js'

const look = {
  body: 'man' as const,
  skin: '#C68642',
  hair: 'lowcut',
  hairColor: '#0D0D0D',
  outfit: 'casual',
  topColor: '#2B7FFF',
  bottomColor: '#12151F',
}

describe('computeSetupStatus', () => {
  it('starts at look with no character', () => {
    expect(
      computeSetupStatus({
        appearance: null,
        traits: [],
        dreamId: null,
        hasGameState: false,
      }),
    ).toEqual({ setupComplete: false, setupStep: 'look' })
  })

  it('advances to traits after look', () => {
    expect(
      computeSetupStatus({
        appearance: look,
        traits: [],
        dreamId: null,
        hasGameState: false,
      }),
    ).toEqual({ setupComplete: false, setupStep: 'traits' })
  })

  it('advances to dream after two traits', () => {
    expect(
      computeSetupStatus({
        appearance: look,
        traits: ['hustler', 'tech'],
        dreamId: null,
        hasGameState: false,
      }),
    ).toEqual({ setupComplete: false, setupStep: 'dream' })
  })

  it('is incomplete without game_state even after look/traits/dream', () => {
    expect(
      computeSetupStatus({
        appearance: look,
        traits: ['hustler', 'tech'],
        dreamId: 'first-class',
        lodgingId: 'hostel-poultry',
        hasGameState: false,
      }),
    ).toEqual({ setupComplete: false, setupStep: null })
  })

  it('is complete with look/traits/dream and game_state', () => {
    expect(
      computeSetupStatus({
        appearance: look,
        traits: ['hustler', 'tech'],
        dreamId: 'first-class',
        lodgingId: 'hostel-poultry',
        hasGameState: true,
      }),
    ).toEqual({ setupComplete: true, setupStep: null })
  })

  it('exports SETUP_INCOMPLETE code', () => {
    expect(SETUP_INCOMPLETE).toBe('SETUP_INCOMPLETE')
  })
})

import { describe, expect, it } from 'vitest'
import { cleanDecor, decorPrice, decorZones, floorColours, wallHex } from './home-decor.js'

describe('home decor', () => {
  it('single room has walls and floor only; hostel has nothing', () => {
    expect(decorZones('single-x')).toEqual(['wall', 'floor'])
    expect(decorZones('selfcon-g2')).toEqual(['wall', 'floor', 'tiles'])
    expect(decorZones('onebed-ojo')).toEqual(['wall', 'floor', 'tiles'])
    expect(decorZones('hostel-poultry')).toEqual([])
  })

  it('prices presets and custom colours, rejects unknown', () => {
    expect(decorPrice('wall', 'classic-cream')).toBe(3000)
    expect(decorPrice('floor', 'black-marble')).toBe(15000)
    expect(decorPrice('tiles', '#aabbcc')).toBe(6000)
    expect(decorPrice('wall', 'terrazzo')).toBeNull()
    expect(decorPrice('floor', 'nope')).toBeNull()
  })

  it('keeps only valid stored values', () => {
    expect(cleanDecor({ wall: 'mint-fresh', floor: 'bad', tiles: '#123456', extra: 'x' })).toEqual({ wall: 'mint-fresh', tiles: '#123456' })
    expect(cleanDecor(null)).toEqual({})
  })

  it('resolves colours', () => {
    expect(wallHex('owambe-gold')).toBe('#d9a93b')
    expect(floorColours('checkerboard')).toEqual(['#f2f2ef', '#1f2023'])
    expect(floorColours('#ffffff')?.[0]).toBe('#ffffff')
  })
})

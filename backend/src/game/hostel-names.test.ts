import { describe, expect, it } from 'vitest'
import { normalizeHostelName, validateHostelName } from './hostel-names.js'

describe('normalizeHostelName', () => {
  it('treats St / Saint, punctuation, case and "hostel" as the same name', () => {
    const key = 'st louis'
    expect(normalizeHostelName('St. Louis Hostel')).toBe(key)
    expect(normalizeHostelName('Saint Louis')).toBe(key)
    expect(normalizeHostelName('  SAINT   louis  hostels ')).toBe(key)
    expect(normalizeHostelName("St-Louis' Hostel!")).toBe(key)
  })

  it('keeps numbers and other words', () => {
    expect(normalizeHostelName('Block 4 Poultry Hostel')).toBe('block 4 poultry')
  })

  it('strips accents', () => {
    expect(normalizeHostelName('Café Lodge')).toBe('cafe lodge')
  })
})

describe('validateHostelName', () => {
  it('rejects empty names and names that are only "hostel"', () => {
    expect(validateHostelName(' ').ok).toBe(false)
    expect(validateHostelName('Hostel').ok).toBe(false)
  })

  it('tidies spacing but keeps the typed casing', () => {
    const result = validateHostelName('  Saint   Louis  Hostel ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.name).toBe('Saint Louis Hostel')
    expect(result.normalized).toBe('st louis')
  })
})

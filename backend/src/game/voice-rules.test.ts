import { describe, expect, it } from 'vitest'
import { cleanPeaks, parseVoiceBody, voiceContentType, voiceExt, voiceLabel, VOICE_BARS } from './voice-rules.js'

describe('voice rules', () => {
  it('accepts Android and iPhone recorder formats, ignoring codec params', () => {
    expect(voiceExt('audio/webm;codecs=opus')).toBe('webm')
    expect(voiceExt('audio/mp4')).toBe('m4a')
    expect(voiceExt('video/mp4')).toBeNull()
    expect(voiceExt(undefined)).toBeNull()
    expect(voiceContentType('voice/c/x.m4a')).toBe('audio/mp4')
  })
  it('cleans the waveform to a fixed number of 0..1 bars', () => {
    const p = cleanPeaks('0.5,2,-1,abc')
    expect(p).toHaveLength(VOICE_BARS)
    expect(p.slice(0, 4)).toEqual([0.5, 1, 0, 0.3])
  })
  it('parses a stored body and rejects junk', () => {
    expect(parseVoiceBody('{"key":"voice/a/b.webm","ms":4200,"peaks":[1]}')?.ms).toBe(4200)
    expect(parseVoiceBody('hello')).toBeNull()
    expect(voiceLabel(65_000)).toBe('1:05')
    expect(voiceLabel(200)).toBe('0:01')
  })
})

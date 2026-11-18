import { describe, expect, it } from 'vitest'
import { photoBody, publicPhotoState, sniffPhoto } from './photo-rules.js'

describe('photo rules', () => {
  it('recognises JPEG and WebP by their bytes, nothing else', () => {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])
    expect(sniffPhoto(jpg)?.ext).toBe('jpg')
    expect(sniffPhoto(webp)?.ext).toBe('webp')
    expect(sniffPhoto(Buffer.from('<svg onload=alert(1)>................'))).toBeNull()
  })
  it('body keeps only a clamped size; states map to public ones', () => {
    expect(JSON.parse(photoBody(99999, 3))).toEqual({ w: 2000, h: 16 })
    expect(publicPhotoState('sent')).toBe('sent')
    expect(publicPhotoState('reported')).toBe('opened')
    expect(publicPhotoState('purged')).toBe('expired')
  })
})

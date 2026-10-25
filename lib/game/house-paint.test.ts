import { CanvasTexture, Color, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { HOUSE_PAINTS, defaultPaintFor, defaultTrimFor, fnv1a, resolvePaint, shadeOf } from './house-paint'
import { paintCacheSize, paintOf, releasePaint } from './paint-material'

describe('house paint', () => {
  it('gives the same player the same colour every time', () => {
    expect(defaultPaintFor('samuel')).toEqual(defaultPaintFor('samuel'))
    expect(fnv1a('samuel:house')).toBe(fnv1a('samuel:house'))
  })

  it('spreads players across the palette', () => {
    const used = new Set(Array.from({ length: 200 }, (_, i) => defaultPaintFor(`player-${i}`).id))
    expect(used.size).toBeGreaterThanOrEqual(HOUSE_PAINTS.length - 1)
  })

  it('salts trim separately from walls', () => {
    const differs = Array.from({ length: 50 }, (_, i) => `p${i}`).some(
      (id) => defaultPaintFor(id).id !== defaultTrimFor(id).id,
    )
    expect(differs).toBe(true)
  })

  it('uses a chosen paint id or #rrggbb, and falls back to the default otherwise', () => {
    expect(resolvePaint({ id: 'a', decor: { wall: 'teal' } }).id).toBe('teal')
    expect(resolvePaint({ id: 'a', decor: { wall: '#AABBCC' } }).hex).toBe('#aabbcc')
    expect(resolvePaint({ id: 'a', decor: { wall: 'not-a-colour' } })).toEqual(defaultPaintFor('a'))
    expect(resolvePaint({ id: 'a' })).toEqual(defaultPaintFor('a'))
  })

  it('shades a colour darker', () => {
    expect(shadeOf('#ffffff', 0.92)).toBe('#ebebeb')
    expect(shadeOf('#000000')).toBe('#000000')
  })
})

describe('paint material', () => {
  it('never changes the shared GLB material and keeps houses independent', () => {
    const shared = new MeshStandardMaterial({ color: '#ffffff', name: 'Wall' })
    const blue = paintOf(shared, '#0000ff')
    const red = paintOf(shared, '#ff0000')

    expect(shared.color.getHexString()).toBe('ffffff')
    expect(blue).not.toBe(red)
    expect((blue as MeshStandardMaterial).color.equals(new Color('#0000ff'))).toBe(true)
    expect((red as MeshStandardMaterial).color.equals(new Color('#ff0000'))).toBe(true)

    // Repainting the red house leaves the blue one alone
    releasePaint(red)
    paintOf(shared, '#00ff00')
    expect((blue as MeshStandardMaterial).color.equals(new Color('#0000ff'))).toBe(true)
  })

  it('shares one copy per colour and disposes it when the last user lets go', () => {
    const shared = new MeshStandardMaterial()
    const before = paintCacheSize()
    const a = paintOf(shared, '#123456')
    const b = paintOf(shared, '#123456')
    expect(a).toBe(b)
    expect(paintCacheSize()).toBe(before + 1)

    let disposed = false
    a.addEventListener('dispose', () => (disposed = true))
    releasePaint(a)
    expect(disposed).toBe(false)
    releasePaint(b)
    expect(disposed).toBe(true)
    expect(paintCacheSize()).toBe(before)
  })

  it('repaints textured materials in the shader, not by tinting the whole texture', () => {
    const shared = new MeshStandardMaterial({ map: new CanvasTexture(document.createElement('canvas')) })
    const painted = paintOf(shared, '#ff8800') as MeshStandardMaterial
    expect(painted.color.getHexString()).toBe(shared.color.getHexString())
    expect(painted.customProgramCacheKey()).toBe('paint')
    expect(shared.onBeforeCompile).not.toBe(painted.onBeforeCompile)
    releasePaint(painted)
  })
})

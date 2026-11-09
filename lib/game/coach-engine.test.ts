import { afterEach, describe, expect, it } from 'vitest'
import { TIP_TEXT, TOUR_STEP_DEFS, bubbleSide, cutout, findTarget, sameBox, visibleBox } from './coach-engine'
import { TIP_IDS, TOUR_STEPS, isTipId, nextTourStep } from './coach-rules'

const words = (s: string) => s.trim().split(/\s+/).length

describe('tour definition', () => {
  it('has one definition per tour step', () => {
    expect(TOUR_STEP_DEFS).toHaveLength(TOUR_STEPS)
  })
  it('every line is short (10 words or fewer)', () => {
    for (const def of TOUR_STEP_DEFS) {
      expect(words(def.fallbackText), def.id).toBeLessThanOrEqual(10)
      if (def.waitText) expect(words(def.waitText), def.id).toBeLessThanOrEqual(10)
      for (const c of def.candidates) expect(words(c.text), `${def.id}: ${c.text}`).toBeLessThanOrEqual(10)
    }
  })
  it('every step can finish by doing something (or a Got it button)', () => {
    for (const def of TOUR_STEP_DEFS) {
      expect(Boolean(def.tapSelectors?.length || def.signal || def.eats || def.gotIt), def.id).toBe(true)
    }
  })
  it('targets are data-coach hooks', () => {
    for (const def of TOUR_STEP_DEFS) for (const c of def.candidates) expect(c.selector).toContain('data-coach')
  })
})

describe('tips', () => {
  it('every tip has a one-sentence line', () => {
    for (const id of TIP_IDS) {
      expect(TIP_TEXT[id], id).toBeTruthy()
      expect(words(TIP_TEXT[id].text), id).toBeLessThanOrEqual(14)
    }
  })
  it('only known tips are accepted', () => {
    expect(isTipId('club')).toBe(true)
    expect(isTipId('nope')).toBe(false)
  })
})

describe('tour progress', () => {
  it('moves forward, never back, and ends after the last step', () => {
    expect(nextTourStep(0, 0)).toBe(1)
    expect(nextTourStep(3, 1)).toBe(3)
    expect(nextTourStep(TOUR_STEPS - 2, TOUR_STEPS - 2)).toBe(TOUR_STEPS - 1)
    expect(nextTourStep(0, TOUR_STEPS - 1)).toBeNull()
  })
})

describe('cut-out and bubble placement', () => {
  it('adds room around the target and stays on screen', () => {
    expect(cutout({ left: 20, top: 100, width: 50, height: 40 }, 360, 740)).toEqual({ left: 14, top: 94, width: 62, height: 52 })
    expect(cutout({ left: 0, top: 0, width: 50, height: 40 }, 360, 740)).toEqual({ left: 0, top: 0, width: 56, height: 46 })
    const edge = cutout({ left: 330, top: 700, width: 50, height: 60 }, 360, 740)
    expect(edge.left + edge.width).toBeLessThanOrEqual(360)
    expect(edge.top + edge.height).toBeLessThanOrEqual(740)
  })
  it('puts the bubble where there is room', () => {
    expect(bubbleSide({ left: 0, top: 80, width: 100, height: 40 }, 740)).toBe('below')
    expect(bubbleSide({ left: 0, top: 640, width: 100, height: 60 }, 740)).toBe('above')
  })
  it('sameBox compares boxes by value', () => {
    expect(sameBox({ left: 1, top: 2, width: 3, height: 4 }, { left: 1, top: 2, width: 3, height: 4 })).toBe(true)
    expect(sameBox({ left: 1, top: 2, width: 3, height: 4 }, { left: 1, top: 2, width: 3, height: 5 })).toBe(false)
    expect(sameBox(null, null)).toBe(true)
  })
})

describe('finding the target', () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

  const add = (html: string, box: DOMRect) => {
    document.body.insertAdjacentHTML('beforeend', html)
    const el = document.body.lastElementChild as HTMLElement
    el.getBoundingClientRect = () => box
    return el
  }
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('waits (null) when the target is not on screen yet, and never throws', () => {
    expect(findTarget([{ selector: '[data-coach="nope"]', text: 'x' }], document, 360, 740)).toBeNull()
    add('<button data-coach="late"></button>', rect(0, 0, 0, 0))
    expect(findTarget([{ selector: '[data-coach="late"]', text: 'x' }], document, 360, 740)).toBeNull()
    add('<button data-coach="off"></button>', rect(500, 10, 40, 40))
    expect(findTarget([{ selector: '[data-coach="off"]', text: 'x' }], document, 360, 740)).toBeNull()
  })

  it('picks the first candidate that is on screen', () => {
    add('<button data-coach="b"></button>', rect(10, 20, 80, 40))
    const hit = findTarget(
      [
        { selector: '[data-coach="a"]', text: 'a' },
        { selector: '[data-coach="b"]', text: 'b' },
      ],
      document,
      360,
      740,
    )
    expect(hit?.index).toBe(1)
    expect(hit?.box).toEqual({ left: 10, top: 20, width: 80, height: 40 })
  })

  it('follows the target when it moves or resizes', () => {
    const el = add('<button data-coach="m"></button>', rect(10, 20, 80, 40))
    const c = [{ selector: '[data-coach="m"]', text: 'm' }]
    expect(findTarget(c, document, 360, 740)?.box.top).toBe(20)
    el.getBoundingClientRect = () => rect(100, 300, 120, 60)
    expect(findTarget(c, document, 360, 740)?.box).toEqual({ left: 100, top: 300, width: 120, height: 60 })
  })

  it('ignores hidden elements', () => {
    const el = add('<button data-coach="h"></button>', rect(10, 20, 80, 40))
    el.style.display = 'none'
    expect(visibleBox(el, 360, 740)).toBeNull()
  })
})

import type { CoachSignal } from './coach-api'
import type { TipId } from './coach-rules'

/*
 * Pure bits of the coach marks: what each tour step points at, how it finishes, and where the bubble goes.
 * (Kept free of React so it is easy to test.)
 */

export type CoachCandidate = {
  /** CSS selector of the thing to point at (we use [data-coach="…"]) */
  selector: string
  /** One short line (about 10 words or fewer) */
  text: string
}

export type TourStepDef = {
  id: string
  /** First one found on screen wins, so a step can follow the player (sheet open, sheet closed…) */
  candidates: CoachCandidate[]
  /** Said when the player is not shown anything to point at */
  fallbackText: string
  /** Said when the target is missing for a moment (e.g. the phone is covering it) */
  waitText?: string
  /** The step also finishes when one of these is tapped */
  tapSelectors?: string[]
  /** …or when the game reports this */
  signal?: CoachSignal
  /** …or when hunger goes up (they ate) */
  eats?: boolean
  /** Look-only step: a "Got it" button finishes it */
  gotIt?: boolean
  /** Don't show this step when this is on screen (the player is already past it) */
  skipIfPresent?: string
  /** Don't show this step to players who don't have a phone */
  needsPhone?: boolean
}

export const TOUR_STEP_DEFS: TourStepDef[] = [
  {
    id: 'needs',
    candidates: [{ selector: '[data-coach="needs"]', text: 'These are your needs. Keep them up.' }],
    fallbackText: 'Watch your needs bars. Keep them up.',
    gotIt: true,
  },
  {
    id: 'eat',
    candidates: [],
    fallbackText: 'Hungry? Tap the cooker at home to eat.',
    eats: true,
  },
  {
    id: 'outside',
    candidates: [{ selector: '[data-coach="outside"]', text: 'Tap Go outside.' }],
    fallbackText: 'Go outside your room.',
    waitText: 'Go to your room, then step outside.',
    tapSelectors: ['[data-coach="outside"]'],
    skipIfPresent: '[data-coach="travel"]',
  },
  {
    id: 'ride',
    candidates: [
      { selector: '[data-coach="mode-keke"][aria-checked="false"]', text: 'Pick Keke for a fast ride.' },
      { selector: '[data-coach="place-aau-gate"]', text: 'Now tap AAU Gate.' },
      { selector: '[data-coach="travel-list"]', text: 'Pick any AAU place.' },
      { selector: '[data-coach="travel"]', text: 'Tap Where to?' },
    ],
    fallbackText: 'Take a keke to an AAU place.',
    signal: 'ride',
  },
  {
    id: 'phone',
    candidates: [{ selector: '[data-coach="nav-phone"]', text: 'Open your phone.' }],
    fallbackText: 'Open your phone.',
    tapSelectors: ['[data-coach="nav-phone"]'],
    signal: 'phone-open',
    needsPhone: true,
  },
  {
    id: 'missions',
    candidates: [{ selector: '[data-coach="missions"]', text: "Tap here for today's missions." }],
    fallbackText: "Find today's missions.",
    waitText: 'Close the phone to see missions.',
    tapSelectors: ['[data-coach="missions"]'],
    signal: 'missions-open',
  },
]

/** Plain, short lines for the one-time tips (Ekpoma tone). */
export const TIP_TEXT: Record<TipId, { emoji: string; text: string }> = {
  'buy-mode': { emoji: '🛋️', text: 'Pick furniture, place it in your room. Tap Exit when done.' },
  club: { emoji: '🎧', text: 'Dance, meet people and tap anybody to say hi.' },
  family: { emoji: '💞', text: 'Add Bae and family here. Both sides must say yes.' },
  bank: { emoji: '🏦', text: 'See your naira here, and where it went.' },
  'phone-apps': { emoji: '🔋', text: 'Apps use battery and data. Charge and buy data in Settings.' },
  forbes: { emoji: '💼', text: 'Forbes is for big money. Grow your naira to climb.' },
}

export type Box = { left: number; top: number; width: number; height: number }

/** The cut-out: the target with a little breathing room, kept inside the screen. */
export function cutout(rect: Box, vw: number, vh: number, pad = 6): Box {
  const left = Math.max(0, rect.left - pad)
  const top = Math.max(0, rect.top - pad)
  const right = Math.min(vw, rect.left + rect.width + pad)
  const bottom = Math.min(vh, rect.top + rect.height + pad)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** Put the bubble on the side with more room (the pointer sits between it and the target). */
export function bubbleSide(box: Box, vh: number): 'above' | 'below' {
  const above = box.top
  const below = vh - (box.top + box.height)
  return below >= 150 || below >= above ? 'below' : 'above'
}

export const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)

/** Is this element actually on screen and big enough to point at? */
export function visibleBox(el: Element, vw: number, vh: number): Box | null {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return null
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
  if (style && (style.visibility === 'hidden' || style.display === 'none')) return null
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** First candidate whose element is on screen. */
export function findTarget(
  candidates: CoachCandidate[],
  root: ParentNode,
  vw: number,
  vh: number,
): { index: number; el: Element; box: Box } | null {
  for (let index = 0; index < candidates.length; index++) {
    // Several elements can share a hook (a phone and a desktop version): the first one actually showing wins
    for (const el of Array.from(root.querySelectorAll(candidates[index]!.selector))) {
      const box = visibleBox(el, vw, vh)
      if (box) return { index, el, box }
    }
  }
  return null
}

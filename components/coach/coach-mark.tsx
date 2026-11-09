'use client'

import { useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { bubbleSide, cutout, findTarget, sameBox, type Box, type CoachCandidate } from '@/lib/game/coach-engine'
import styles from './coach-mark.module.css'

const WAIT_MS = 1200

type Found = { index: number; box: Box }

/**
 * A coach mark: dims the screen except a cut-out around the target, a bouncing pointer, one short line
 * and Skip. It looks the target up again every frame, so it follows it when it moves or resizes, and it
 * just waits (showing `waitText`, or nothing) while the target is not on screen. With no candidates it is a
 * plain floating hint that never blocks the game.
 */
export function CoachMark({
  candidates,
  fallbackText,
  waitText,
  gotItLabel,
  onGotIt,
  onTargetTap,
  onSkip,
}: {
  candidates: CoachCandidate[]
  fallbackText: string
  waitText?: string
  gotItLabel?: string
  onGotIt?: () => void
  /** The player tapped the thing we point at (the tap still reaches it) */
  onTargetTap?: (index: number) => void
  onSkip: () => void
}) {
  const [found, setFound] = useState<Found | null>(null)
  const [view, setView] = useState({ w: 0, h: 0 })
  const [waited, setWaited] = useState(false)
  const foundRef = useRef<{ el: Element; index: number } | null>(null)
  const tapRef = useRef(onTargetTap)
  tapRef.current = onTargetTap

  // Follow the target: a cheap lookup every frame, state only changes when it moved
  useEffect(() => {
    let raf = 0
    let alive = true
    const tick = () => {
      if (!alive) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const hit = findTarget(candidates, document, vw, vh)
      foundRef.current = hit ? { el: hit.el, index: hit.index } : null
      setView((v) => (v.w === vw && v.h === vh ? v : { w: vw, h: vh }))
      setFound((prev) => {
        if (!hit) return prev ? null : prev
        return prev && prev.index === hit.index && sameBox(prev.box, hit.box) ? prev : { index: hit.index, box: hit.box }
      })
      raf = window.requestAnimationFrame(tick)
    }
    tick()
    return () => {
      alive = false
      window.cancelAnimationFrame(raf)
    }
  }, [candidates])

  // Target missing for a moment: say what to do instead of showing nothing
  useEffect(() => {
    setWaited(false)
    if (found) return
    const id = window.setTimeout(() => setWaited(true), WAIT_MS)
    return () => window.clearTimeout(id)
  }, [found, candidates])

  // Taps on the target count (we only listen; the game still gets the tap)
  useEffect(() => {
    const onClick = (event: Event) => {
      const hit = foundRef.current
      if (hit && event.target instanceof Node && hit.el.contains(event.target)) tapRef.current?.(hit.index)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  const skip = (
    <button type="button" className={styles.skip} onClick={onSkip}>
      Skip
    </button>
  )
  const gotIt =
    onGotIt && gotItLabel ? (
      <button type="button" className={styles.btn} onClick={onGotIt}>
        {gotItLabel}
      </button>
    ) : null

  // Nothing to point at: a floating hint, only after a short wait when a target was expected
  if (!found) {
    if (candidates.length > 0 && !waited) return null
    return (
      <BodyPortal>
        <div className={styles.layer} role="status" aria-live="polite">
          <div className={`${styles.bubble} ${styles.bubbleFloat}`}>
            <span className={styles.text}>{candidates.length > 0 ? (waitText ?? fallbackText) : fallbackText}</span>
            {gotIt}
            {skip}
          </div>
        </div>
      </BodyPortal>
    )
  }

  const hole = cutout(found.box, view.w, view.h)
  const side = bubbleSide(hole, view.h)
  const below = side === 'below'
  const centreX = Math.min(Math.max(hole.left + hole.width / 2, 22), Math.max(22, view.w - 22))
  const text = candidates[found.index]?.text ?? fallbackText
  const bubblePos = below ? { top: hole.top + hole.height + 52 } : { bottom: view.h - hole.top + 52 }
  const pointerPos = below ? { top: hole.top + hole.height + 4 } : { top: hole.top - 48 }

  return (
    <BodyPortal>
      <div className={styles.layer} role="status" aria-live="polite">
        <div className={styles.block} style={{ left: 0, top: 0, width: '100%', height: hole.top }} />
        <div className={styles.block} style={{ left: 0, top: hole.top + hole.height, width: '100%', bottom: 0 }} />
        <div className={styles.block} style={{ left: 0, top: hole.top, width: hole.left, height: hole.height }} />
        <div className={styles.block} style={{ left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }} />
        <div className={styles.ring} style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} />
        <span className={`${styles.pointer} ${below ? styles.pointerUp : ''}`} style={{ left: centreX, ...pointerPos }} aria-hidden="true">
          {below ? '👆' : '👇'}
        </span>
        <div className={styles.bubble} style={bubblePos}>
          <span className={styles.text}>{text}</span>
          {gotIt}
          {skip}
        </div>
      </div>
    </BodyPortal>
  )
}

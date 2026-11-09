'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { dismissTip, finishTourStep, onCoachSignal, skipTour, useCoach, useTip } from '@/lib/game/coach-api'
import { TOUR_STEP_DEFS, TIP_TEXT } from '@/lib/game/coach-engine'
import { TOUR_STEPS } from '@/lib/game/coach-rules'
import { usePhoneOpenFlag } from '@/lib/game/phone-open'
import { useTrip } from '@/lib/game/trip'
import { CoachMark } from './coach-mark'
import styles from './coach-mark.module.css'

/**
 * The first-time tour (new characters only, progress kept on the server) and the one-time tips.
 * Each step finishes when the player really does the thing. Skip ends the whole tour for good.
 */
export function CoachTour() {
  const { state, isGuest } = useGame()
  const ready = !isGuest && Boolean(state)
  const coach = useCoach(ready)
  const trip = useTrip()
  const phoneOpen = usePhoneOpenFlag()
  const step = coach?.step ?? 0
  const def = coach?.tour && step < TOUR_STEPS ? TOUR_STEP_DEFS[step] : undefined
  const hunger = state?.hunger ?? 100
  const hasPhone = state?.hasPhone ?? false

  // How hungry they were when the "eat" step began: eating raises it
  const baseHunger = useRef<number | null>(null)
  // A daily card (check-in, story) is up: the tour waits its turn
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setHeld(Boolean(document.querySelector('[data-coach-hold]'))), 400)
    return () => window.clearInterval(id)
  }, [])

  const done = useCallback(() => {
    baseHunger.current = null
    void finishTourStep(step)
  }, [step])

  // Steps the player is already past (or can't do) finish on their own
  useEffect(() => {
    if (!def || !ready || trip) return
    if (def.needsPhone && !hasPhone) return done()
    if (def.eats && hunger >= 95) return done()
    if (def.skipIfPresent && document.querySelector(def.skipIfPresent)) return done()
  }, [def, ready, trip, hasPhone, hunger, done])

  // Game signals (rode a keke, opened the phone, opened missions)
  useEffect(() => {
    if (!def?.signal) return
    return onCoachSignal((signal) => {
      if (signal === def.signal) done()
    })
  }, [def, done])

  // Ate something: hunger went up since the step began
  useEffect(() => {
    if (!def?.eats) {
      baseHunger.current = null
      return
    }
    if (baseHunger.current === null) baseHunger.current = hunger
    else if (hunger > baseHunger.current + 2) done()
    else if (hunger < baseHunger.current) baseHunger.current = hunger
  }, [def, hunger, done])

  const tip = useTip()
  // A tip goes away by itself after a while (still counts as seen)
  useEffect(() => {
    if (!tip) return
    const id = window.setTimeout(dismissTip, 9000)
    return () => window.clearTimeout(id)
  }, [tip])

  if (!ready || held) return null

  // The phone covers the screen: only the phone step (which ends when it opens) and a nudge to close it make sense
  if (def && !trip && phoneOpen && def.id !== 'missions') return null
  if (def && !trip) {
    const covered = phoneOpen
    return (
      <CoachMark
        key={`${def.id}${covered ? '-covered' : ''}`}
        candidates={covered ? [] : def.candidates}
        fallbackText={covered ? (def.waitText ?? def.fallbackText) : def.fallbackText}
        waitText={def.waitText}
        gotItLabel={def.gotIt ? 'Got it' : undefined}
        onGotIt={def.gotIt ? done : undefined}
        onTargetTap={def.tapSelectors ? () => done() : undefined}
        onSkip={() => void skipTour()}
      />
    )
  }

  if (tip && !coach?.tour) {
    const info = TIP_TEXT[tip]
    return (
      <div className={styles.layer} role="status" aria-live="polite">
        <div className={`${styles.bubble} ${styles.bubbleFloat}`}>
          <span aria-hidden="true">{info.emoji}</span>
          <span className={styles.text}>{info.text}</span>
          <button type="button" className={styles.btn} onClick={dismissTip}>
            Got it
          </button>
        </div>
      </div>
    )
  }

  return null
}

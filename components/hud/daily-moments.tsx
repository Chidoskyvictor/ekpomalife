'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { playSfx } from '@/lib/audio/sfx'
import {
  checkInToday,
  checkinTriedToday,
  chooseStory,
  fetchNextStory,
  type CheckinResult,
  type StoryChoiceResult,
  type StoryView,
} from '@/lib/game/daily-api'
import { useTrip } from '@/lib/game/trip'
import styles from './daily-moments.module.css'

const STORY_POLL_MS = 20 * 60_000

/*
 * Two centred cards, one at a time: the daily check-in (first load of the day) and a story moment
 * (server decides if and when, at most 2 a day). Never shows during a ride.
 */
export function DailyMoments() {
  const { state, isGuest, refreshServer } = useGame()
  const trip = useTrip()
  const reduce = useReducedMotion() ?? false
  const [checkin, setCheckin] = useState<CheckinResult | null>(null)
  const [story, setStory] = useState<StoryView | null>(null)
  const [outcome, setOutcome] = useState<StoryChoiceResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkinDone, setCheckinDone] = useState(false)

  const ready = !isGuest && Boolean(state) && !trip

  // Daily check-in: once per browser day, then the server decides whether it pays
  useEffect(() => {
    if (isGuest || !state || checkinDone) return
    setCheckinDone(true)
    if (checkinTriedToday()) return
    void checkInToday().then((res) => {
      if (res?.firstToday) {
        setCheckin(res)
        playSfx('checkin')
        void refreshServer()
      }
    })
  }, [isGuest, state, checkinDone, refreshServer])

  const loadStory = useCallback(async () => {
    const next = await fetchNextStory().catch(() => null)
    if (next) {
      setStory((cur) => cur ?? next)
      playSfx('story')
    }
  }, [])

  // Story moments: asked after the check-in card is gone, then every 20 minutes
  useEffect(() => {
    if (!ready || !checkinDone || checkin) return
    const first = window.setTimeout(() => void loadStory(), 4000)
    const poll = window.setInterval(() => void loadStory(), STORY_POLL_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(poll)
    }
  }, [ready, checkinDone, checkin, loadStory])

  const pick = async (index: number) => {
    if (!story || busy) return
    setBusy(true)
    const res = await chooseStory(story.seq, index)
    setBusy(false)
    if (!res.ok) {
      setStory(null)
      return
    }
    setOutcome(res.result)
    playSfx(res.result.effects.cash && res.result.effects.cash < 0 ? 'spend' : 'tap')
    void refreshServer()
  }

  const closeStory = () => {
    setStory(null)
    setOutcome(null)
  }

  useEffect(() => {
    if (!checkin && !story) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (checkin) setCheckin(null)
      else if (outcome) closeStory()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [checkin, story, outcome])

  if (!ready) return null
  const motionProps = {
    initial: reduce ? false : ({ opacity: 0, y: 14, scale: 0.97 } as const),
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.28, ease: 'easeOut' as const },
  }

  if (checkin) {
    return (
      <BodyPortal>
        <div className={styles.backdrop} onClick={() => setCheckin(null)}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-title"
            className={styles.card}
            onClick={(event) => event.stopPropagation()}
            {...motionProps}
          >
            <span className={styles.emoji} aria-hidden="true">
              {checkin.cycleDay === 7 ? '🎁' : '🔥'}
            </span>
            <h2 id="checkin-title" className={styles.title}>
              {checkin.streak}-day streak
            </h2>
            <p className={styles.reward}>+₦{checkin.granted.toLocaleString()} for showing up</p>
            <div className={styles.days} aria-hidden="true">
              {checkin.rewards.map((_, i) => (
                <span key={i} className={`${styles.day} ${i < checkin.cycleDay ? styles.dayOn : ''}`}>
                  {i === 6 ? '🎁' : i + 1}
                </span>
              ))}
            </div>
            <p className={styles.sub}>
              {checkin.cycleDay === 7
                ? 'Seven days in a row. Gift collected!'
                : `Tomorrow: +₦${checkin.nextReward.toLocaleString()}. Come back to keep it going.`}
            </p>
            <button type="button" className={styles.primary} onClick={() => setCheckin(null)}>
              Nice
            </button>
          </motion.div>
        </div>
      </BodyPortal>
    )
  }

  if (story) {
    return (
      <BodyPortal>
        <div className={styles.backdrop}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="story-title" className={styles.card} {...motionProps}>
            <span className={styles.emoji} aria-hidden="true">
              {story.emoji}
            </span>
            <p className={styles.place}>{story.place}</p>
            <h2 id="story-title" className={styles.title}>
              {story.title}
            </h2>
            {outcome ? (
              <>
                <p className={styles.sub}>{outcome.outcome}</p>
                <button type="button" className={styles.primary} onClick={closeStory}>
                  Continue
                </button>
              </>
            ) : (
              <>
                <p className={styles.sub}>{story.text}</p>
                <div className={styles.choices}>
                  {story.choices.map((c, i) => (
                    <button key={c.label} type="button" className={styles.choice} disabled={busy} onClick={() => void pick(i)}>
                      <span>{c.label}</span>
                      <small>{c.hint}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </div>
      </BodyPortal>
    )
  }
  return null
}

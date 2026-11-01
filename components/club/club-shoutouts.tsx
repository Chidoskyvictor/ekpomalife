'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLowPerf } from '@/hooks/use-low-perf'
import type { Spray } from '@/lib/game/club-live'
import styles from './club-shoutouts.module.css'

/**
 * Club shout-outs, in front of everything (above the club sheet and HUD, taps pass through):
 *  - "MAKE IT RAIN!"           when anyone sprays money
 *  - "@x SHUT DOWN THE CLUB!"  when someone takes the top-spender spot
 *  - The DJ card               greets you when you walk in, and everyone who joins after
 * One at a time from a small queue so they never stack.
 */

type Shout =
  | { id: string; kind: 'rain'; who: string; amount: number; mine: boolean }
  | { id: string; kind: 'shut'; who: string }
  | { id: string; kind: 'dj'; who: string; you: boolean }

const DURATION: Record<Shout['kind'], number> = { rain: 6000, shut: 7000, dj: 4500 }
const CONFETTI: Record<'rain' | 'shut', string[]> = {
  rain: ['💸', '💵', '💰', '💸', '🎉', '💵'],
  shut: ['🍾', '👑', '🎆', '🥂', '✨', '💃'],
}

export function ClubShoutouts({
  clubName,
  me,
  sprays,
  topUsername,
  peerNames,
}: {
  clubName: string
  me: string | null | undefined
  sprays: Spray[]
  /** Tonight's biggest spender (from the venue board). */
  topUsername: string | null | undefined
  /** Usernames of the others in your group right now. */
  peerNames: string[]
}) {
  const reduced = useReducedMotion() ?? false
  const lowPerf = useLowPerf()
  const [queue, setQueue] = useState<Shout[]>([])
  const push = (shout: Shout) => setQueue((q) => (q.some((s) => s.id === shout.id) ? q : [...q, shout].slice(-4)))

  // DJ greets you once when you walk in
  const greeted = useRef(false)
  useEffect(() => {
    if (!me || greeted.current) return
    greeted.current = true
    push({ id: `dj-${me}`, kind: 'dj', who: me, you: true })
  }, [me])

  // New sprays → MAKE IT RAIN
  const seenSprays = useRef(new Set<string>())
  useEffect(() => {
    for (const s of sprays) {
      if (seenSprays.current.has(s.id)) continue
      seenSprays.current.add(s.id)
      push({ id: `rain-${s.id}`, kind: 'rain', who: s.byUsername, amount: s.amount, mine: s.mine })
    }
  }, [sprays])

  // Top spot changes hands → SHUT DOWN THE CLUB (not on the first load: that's just who was already there)
  const lastTop = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (topUsername === undefined) return
    if (lastTop.current === undefined) {
      lastTop.current = topUsername ?? null
      return
    }
    if (topUsername && topUsername !== lastTop.current) {
      push({ id: `shut-${topUsername}-${Date.now()}`, kind: 'shut', who: topUsername })
    }
    lastTop.current = topUsername ?? null
  }, [topUsername])

  // Someone joins your group after you → the DJ shouts them out
  const knownPeers = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (knownPeers.current === null) {
      // First snapshot: already here, no shout
      if (peerNames.length) knownPeers.current = new Set(peerNames)
      return
    }
    for (const name of peerNames) {
      if (knownPeers.current.has(name)) continue
      knownPeers.current.add(name)
      push({ id: `dj-${name}-${Date.now()}`, kind: 'dj', who: name, you: false })
    }
  }, [peerNames])

  const current = queue[0] ?? null
  useEffect(() => {
    if (!current) return
    const id = window.setTimeout(() => setQueue((q) => q.slice(1)), DURATION[current.kind])
    return () => window.clearTimeout(id)
  }, [current])

  const pieces = useMemo(() => {
    if (!current || current.kind === 'dj' || reduced) return []
    const set = CONFETTI[current.kind]
    const count = lowPerf ? 8 : 18
    return Array.from({ length: count }, (_, i) => ({
      key: `${current.id}-${i}`,
      emoji: set[i % set.length],
      left: Math.round(((i + Math.random()) / count) * 100),
      delay: Math.random() * 1.6,
      duration: 2.6 + Math.random() * 1.8,
      size: 22 + Math.round(Math.random() * 14),
    }))
  }, [current, reduced, lowPerf])

  return (
    <div className={styles.layer} aria-live="polite">
      <AnimatePresence>
        {current && current.kind === 'dj' ? (
          <motion.div
            key={current.id}
            className={styles.dj}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <span className={styles.djKicker}>🎧 The DJ</span>
            <strong className={styles.djTitle}>
              Shout-out to <span className={styles.gold}>@{current.who}</span>!!!
            </strong>
            <span className={styles.djSub}>
              {current.you ? 'This one goes out to you!' : `Welcome to ${clubName || 'the club'}!`}
            </span>
          </motion.div>
        ) : null}

        {current && current.kind !== 'dj' ? (
          <motion.div
            key={current.id}
            className={styles.big}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.p
              className={styles.headline}
              initial={reduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              {current.kind === 'rain' ? (
                'MAKE IT RAIN!'
              ) : (
                <>
                  @{current.who}
                  <br />
                  SHUT DOWN THE CLUB!
                </>
              )}
            </motion.p>
            <p className={styles.banner}>
              {current.kind === 'rain'
                ? current.mine
                  ? `You're spraying the whole club! ₦${current.amount.toLocaleString()}`
                  : `@${current.who} is spraying ₦${current.amount.toLocaleString()} · tap the notes to grab!`
                : `@${current.who} is the biggest spender tonight. Everybody's having a good time 🍾`}
            </p>
            {pieces.map((p) => (
              <span
                key={p.key}
                className={styles.piece}
                aria-hidden="true"
                style={{
                  left: `${p.left}%`,
                  fontSize: p.size,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                }}
              >
                {p.emoji}
              </span>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

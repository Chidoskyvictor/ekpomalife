'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { playSfx } from '@/lib/audio/sfx'
import { CLUB_DUCK_EVENT } from './club-music'
import { useLowPerf } from '@/hooks/use-low-perf'
import type { Spray } from '@/lib/game/club-live'
import type { HypeEvent } from '@/lib/game/venues-api'
import styles from './club-shoutouts.module.css'

/**
 * Club shout-outs, in front of everything (above the club sheet and HUD, taps pass through):
 *  - "MAKE IT RAIN!"           when anyone sprays money
 *  - "@x SHUT DOWN THE CLUB!"  when someone takes the top-spender spot
 *  - The DJ card               only for a big spender: ₦5m+ and above the club's average spray, or ₦15m+
 *                               (walking in earns no shout-out; you have to spend for it)
 *  - Hype (paid, live)         the DJ shout-out for the hyped player (Mega adds fireworks); a round / shut-down
 *                               are the big headlines
 * One at a time from a small queue so they never stack.
 */

/**
 * The DJ only notices real money: a spray must be at least DJ_FLOOR and above the club's average
 * spray; DJ_ALWAYS and up always gets the shout-out.
 */
const DJ_FLOOR = 5_000_000
const DJ_ALWAYS = 15_000_000

type Shout =
  | { id: string; kind: 'rain'; who: string; amount: number; mine: boolean }
  | { id: string; kind: 'shut'; who: string; paid?: number }
  | { id: string; kind: 'round'; who: string; amount: number; mine: boolean }
  | { id: string; kind: 'hype'; tier: 'hype' | 'mega'; who: string; to: string; you: boolean; toYou: boolean }
  | { id: string; kind: 'dj'; who: string; you: boolean }

const DURATION: Record<Shout['kind'], number> = { rain: 6000, shut: 7000, dj: 4500, round: 6500, hype: 5000 }
const CONFETTI: Record<'rain' | 'shut' | 'round' | 'mega', string[]> = {
  round: ['🍹', '🥂', '🍾', '🍸', '🎉', '✨'],
  mega: ['🎆', '🎇', '✨', '🎉', '💥', '🎊'],
  rain: ['💸', '💵', '💰', '💸', '🎉', '💵'],
  shut: ['🍾', '👑', '🎆', '🥂', '✨', '💃'],
}

export function ClubShoutouts({
  clubName,
  sprays,
  topUsername,
  hypes = [],
  me,
}: {
  clubName: string
  sprays: Spray[]
  /** Tonight's biggest spender (from the venue board). */
  topUsername: string | null | undefined
  /** Live hype events from the club socket; only ones that arrive while you're here play. */
  hypes?: HypeEvent[]
  /** My username, to tell "you" from others. */
  me?: string | null
}) {
  const reduced = useReducedMotion() ?? false
  const lowPerf = useLowPerf()
  const [queue, setQueue] = useState<Shout[]>([])
  const push = (shout: Shout) => setQueue((q) => (q.some((s) => s.id === shout.id) ? q : [...q, shout].slice(-4)))

  // New sprays → MAKE IT RAIN; a spray above the average spray also gets the DJ's shout-out.
  // Sprays already on screen when you arrive are history: they only seed the average.
  const seenSprays = useRef<Set<string> | null>(null)
  const spent = useRef<number[]>([])
  useEffect(() => {
    if (seenSprays.current === null) {
      seenSprays.current = new Set(sprays.map((s) => s.id))
      spent.current = sprays.map((s) => s.amount)
      return
    }
    for (const s of sprays) {
      if (seenSprays.current.has(s.id)) continue
      seenSprays.current.add(s.id)
      const past = spent.current
      const average = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0
      const big = s.amount >= DJ_ALWAYS || (s.amount >= DJ_FLOOR && s.amount > average)
      spent.current = [...past, s.amount].slice(-50)
      push({ id: `rain-${s.id}`, kind: 'rain', who: s.byUsername, amount: s.amount, mine: s.mine })
      if (big) push({ id: `dj-${s.id}`, kind: 'dj', who: s.byUsername, you: s.mine })
      // Every spray: the club song dips and the DJ's air horn blasts, then the notes fly
      window.dispatchEvent(new Event(CLUB_DUCK_EVENT))
      playSfx('airHorn')
      window.setTimeout(() => playSfx('moneyFlutter'), 250)
    }
  }, [sprays])

  // Hype events (paid) arrive live: DJ card for the hyped player, headlines for the big moments.
  // The first batch on mount is ignored so nobody replays an old one.
  const seenHypes = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (seenHypes.current === null) {
      seenHypes.current = new Set(hypes.map((h) => h.id))
      return
    }
    for (const h of hypes) {
      if (seenHypes.current.has(h.id)) continue
      seenHypes.current.add(h.id)
      const you = !!me && h.byUsername === me
      if (h.tier === 'hype' || h.tier === 'mega') {
        push({ id: `hype-${h.id}`, kind: 'hype', tier: h.tier, who: h.byUsername, to: h.toUsername ?? '', you, toYou: !!me && h.toUsername === me })
      } else if (h.tier === 'round') {
        push({ id: `round-${h.id}`, kind: 'round', who: h.byUsername, amount: h.amount, mine: you })
      } else {
        push({ id: `shut-${h.id}`, kind: 'shut', who: h.byUsername, paid: h.amount })
      }
    }
  }, [hypes, me])

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

  const current = queue[0] ?? null
  useEffect(() => {
    if (!current) return
    const id = window.setTimeout(() => setQueue((q) => q.slice(1)), DURATION[current.kind])
    return () => window.clearTimeout(id)
  }, [current])

  const pieces = useMemo(() => {
    if (!current || current.kind === 'dj' || reduced) return []
    if (current.kind === 'hype' && current.tier !== 'mega') return []
    const set = CONFETTI[current.kind === 'hype' ? 'mega' : current.kind]
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
        {current && (current.kind === 'dj' || current.kind === 'hype') ? (
          <motion.div
            key={current.id}
            className={styles.dj}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <span className={styles.djKicker}>🎧 The DJ{current.kind === 'hype' && current.tier === 'mega' ? ' · MEGA HYPE 🎆' : ''}</span>
            <strong className={styles.djTitle}>
              Shout-out to <span className={styles.gold}>@{current.kind === 'hype' ? current.to : current.who}</span>!!!
            </strong>
            <span className={styles.djSub}>
              {current.kind === 'hype'
                ? current.toYou
                  ? `@${current.who} is hyping YOU! This one goes out to you!`
                  : current.you
                    ? `You hyped @${current.to}! The whole club heard it.`
                    : `@${current.who} is hyping @${current.to} in ${clubName || 'the club'}!`
                : current.you
                  ? 'Big spender! This one goes out to you!'
                  : `Big spender in ${clubName || 'the club'}!`}
            </span>
          </motion.div>
        ) : null}

        {current && current.kind === 'hype' && pieces.length ? (
          <div key={`${current.id}-fx`} className={styles.fx} aria-hidden="true">
            {pieces.map((p) => (
              <span
                key={p.key}
                className={styles.piece}
                aria-hidden="true"
                style={{ left: `${p.left}%`, fontSize: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
              >
                {p.emoji}
              </span>
            ))}
          </div>
        ) : null}

        {current && current.kind !== 'dj' && current.kind !== 'hype' ? (
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
              ) : current.kind === 'round' ? (
                <>
                  PREMIUM ROUND
                  <br />
                  ON @{current.who}!
                </>
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
                : current.kind === 'round'
                  ? current.mine
                    ? `You bought the whole club a ₦${current.amount.toLocaleString()} round! 🍹`
                    : `@${current.who} bought the whole club a ₦${current.amount.toLocaleString()} round 🍹`
                  : current.paid
                    ? `@${current.who} paid ₦${current.paid.toLocaleString()}. Everybody is their guest tonight 🍾`
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

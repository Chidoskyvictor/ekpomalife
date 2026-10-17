'use client'

import confetti from 'canvas-confetti'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LobbyButton } from '@/components/auth/lobby-button'
import { commitCharacter, rollStartingMoney } from '@/lib/game/character-api'
import { rememberStartingMoney } from '@/lib/game/creation'
import { formatNaira } from '@/lib/game/live'
import type { Appearance } from '@/lib/game/look'
import type { DreamId } from '@/lib/game/dreams'
import { shareStartingMoneyCard } from '@/lib/game/share-starting-money'
import { confettiCount, tierBadge } from '@/lib/game/starting-money'
import type { TraitId } from '@/lib/game/traits'
import styles from './starting-money-spin.module.css'

const SPIN_MS = 2500
const STOP_STAGGER = 250

function digitsOf(amount: number) {
  return Math.max(0, Math.floor(amount)).toString().padStart(7, '0').split('')
}

function DigitReel({
  finalDigit,
  locked,
  spinning,
  reduced,
}: {
  finalDigit: string
  locked: boolean
  /** When false, freeze on finalDigit (errors / idle). */
  spinning: boolean
  reduced: boolean
}) {
  const [shown, setShown] = useState(reduced ? finalDigit : '0')

  useEffect(() => {
    if (reduced || locked || !spinning) {
      setShown(finalDigit)
      return
    }
    const id = window.setInterval(() => {
      setShown(String(Math.floor(Math.random() * 10)))
    }, 45)
    return () => window.clearInterval(id)
  }, [finalDigit, locked, reduced, spinning])

  return <span className={styles.digit}>{shown}</span>
}

export function StartingMoneySpin({
  username,
  appearance,
  traits,
  dreamId,
  onEnter,
  entering,
  onDismiss,
}: {
  username: string
  appearance: Appearance
  traits: TraitId[]
  dreamId: DreamId
  onEnter: (amount: number) => void
  /** True while navigating into the game after Enter Ekpoma. */
  entering?: boolean
  /** Close overlay so the player can go back / re-pick lodging before money is granted. */
  onDismiss?: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const [amount, setAmount] = useState(0)
  const [tier, setTier] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [locking, setLocking] = useState(0)
  const [landed, setLanded] = useState(false)
  const [busy, setBusy] = useState(true)
  const started = useRef(false)
  const runId = useRef(0)

  const burst = useCallback((nextTier: string) => {
    if (reduced) return
    const count = confettiCount(nextTier)
    void confetti({ particleCount: count, spread: nextTier === 'Nepo Baby' ? 90 : 68, origin: { y: 0.38 } })
    if (count > 120) {
      window.setTimeout(() => {
        void confetti({ particleCount: Math.round(count * 0.4), spread: 110, origin: { y: 0.5 } })
      }, 280)
    }
  }, [reduced])

  const fail = useCallback((text: string) => {
    setError(text)
    setBusy(false)
    setLanded(false)
    setLocking(7) // freeze reels — do not leave them spinning forever
  }, [])

  const run = useCallback(async () => {
    const id = ++runId.current
    setError(null)
    setBusy(true)
    setLanded(false)
    setLocking(0)
    const t0 = Date.now()

    let result: { amount: number; tier: string; message: string } | null = null
    try {
      const saved = await commitCharacter({ appearance, traits, dreamId })
      if (id !== runId.current) return
      if (!saved.ok) {
        fail(saved.error || 'Could not save look/traits/dream before the spin.')
        return
      }
      const rolled = await rollStartingMoney()
      if (id !== runId.current) return
      if (!rolled.ok) {
        fail(rolled.error || 'Starting money roll failed.')
        return
      }
      result = { amount: rolled.amount, tier: rolled.tier, message: rolled.message }
    } catch (err) {
      if (id !== runId.current) return
      const msg = err instanceof Error ? err.message : String(err)
      fail(`Spin crashed: ${msg}`)
      return
    }
    if (!result) {
      fail('Could not get starting money from the server. Check your connection and try again.')
      return
    }

    rememberStartingMoney(username, result.amount, result.tier)
    setAmount(result.amount)
    setTier(result.tier)
    setMessage(result.message)

    const wait = reduced ? 0 : Math.max(0, SPIN_MS - (Date.now() - t0))
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
    if (id !== runId.current) return

    try {
      if (reduced) {
        setLocking(7)
      } else {
        for (let i = 1; i <= 7; i += 1) {
          if (id !== runId.current) return
          setLocking(i)
          try {
            navigator.vibrate?.(20)
          } catch {
            /* ignore */
          }
          if (i < 7) await new Promise((resolve) => window.setTimeout(resolve, STOP_STAGGER))
        }
      }
    } finally {
      if (id !== runId.current) return
      setLocking(7)
      setLanded(true)
      setBusy(false)
      try {
        burst(result.tier)
      } catch {
        /* ignore */
      }
    }
  }, [appearance, burst, dreamId, fail, reduced, traits, username])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  const digits = digitsOf(amount)
  const badge = tier ? tierBadge(tier) : null
  const spinning = busy && !error && locking < 7

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="starting-money-title">
      <div className={styles.card}>
        <h2 id="starting-money-title" className={styles.title}>
          Your starting money
        </h2>

        {reduced && landed ? (
          <p className={styles.amountFade}>{formatNaira(amount)}</p>
        ) : (
          <div className={styles.reels} aria-live="polite" aria-label={landed ? formatNaira(amount) : 'Spinning starting money'}>
            <span className={styles.naira}>₦</span>
            <DigitReel finalDigit={digits[0] ?? '0'} locked={locking >= 1} spinning={spinning} reduced={reduced} />
            <span className={styles.comma}>,</span>
            <DigitReel finalDigit={digits[1] ?? '0'} locked={locking >= 2} spinning={spinning} reduced={reduced} />
            <DigitReel finalDigit={digits[2] ?? '0'} locked={locking >= 3} spinning={spinning} reduced={reduced} />
            <DigitReel finalDigit={digits[3] ?? '0'} locked={locking >= 4} spinning={spinning} reduced={reduced} />
            <span className={styles.comma}>,</span>
            <DigitReel finalDigit={digits[4] ?? '0'} locked={locking >= 5} spinning={spinning} reduced={reduced} />
            <DigitReel finalDigit={digits[5] ?? '0'} locked={locking >= 6} spinning={spinning} reduced={reduced} />
            <DigitReel finalDigit={digits[6] ?? '0'} locked={locking >= 7} spinning={spinning} reduced={reduced} />
          </div>
        )}

        {error ? (
          <div className={styles.actions}>
            <p className={styles.error} role="alert">
              {error}
            </p>
            <LobbyButton type="button" onClick={() => void run()}>
              Try again
            </LobbyButton>
            {onDismiss ? (
              <button type="button" className={styles.share} onClick={onDismiss}>
                Back to lodging
              </button>
            ) : null}
          </div>
        ) : null}

        <AnimatePresence>
          {landed && badge ? (
            <motion.div
              className={styles.badge}
              initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.72 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            >
              <span aria-hidden="true">{badge.emoji}</span>
              {badge.name}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {landed && message ? (
          <motion.p
            className={styles.message}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: reduced ? 0 : 0.12 }}
          >
            {message}
          </motion.p>
        ) : null}

        {landed ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.share}
              onClick={() => void shareStartingMoneyCard(amount, tier)}
            >
              Share
            </button>
            <LobbyButton type="button" loading={entering} onClick={() => onEnter(amount)}>
              Enter Ekpoma 🚀
            </LobbyButton>
          </div>
        ) : null}

        {busy && !error ? <p className={styles.message}>Spinning your start...</p> : null}
      </div>
    </div>
  )
}

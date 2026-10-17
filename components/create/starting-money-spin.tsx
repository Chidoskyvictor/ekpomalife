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
  reduced,
}: {
  finalDigit: string
  locked: boolean
  reduced: boolean
}) {
  const [shown, setShown] = useState(reduced ? finalDigit : '0')

  useEffect(() => {
    if (reduced || locked) {
      setShown(finalDigit)
      return
    }
    const id = window.setInterval(() => {
      setShown(String(Math.floor(Math.random() * 10)))
    }, 45)
    return () => window.clearInterval(id)
  }, [finalDigit, locked, reduced])

  return <span className={styles.digit}>{shown}</span>
}

export function StartingMoneySpin({
  username,
  appearance,
  traits,
  dreamId,
  onEnter,
}: {
  username: string
  appearance: Appearance
  traits: TraitId[]
  dreamId: DreamId
  onEnter: (amount: number) => void
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

  const run = useCallback(async () => {
    setError(null)
    setBusy(true)
    setLanded(false)
    setLocking(0)
    const t0 = Date.now()

    let result: { amount: number; tier: string; message: string } | null = null
    try {
      const saved = await commitCharacter({ appearance, traits, dreamId })
      if (!saved.ok) {
        setError(saved.error || 'Could not save look/traits/dream before the spin.')
        setBusy(false)
        return
      }
      const rolled = await rollStartingMoney()
      if (!rolled.ok) {
        setError(rolled.error || 'Starting money roll failed.')
        setBusy(false)
        return
      }
      result = { amount: rolled.amount, tier: rolled.tier, message: rolled.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Spin crashed: ${msg}`)
      setBusy(false)
      return
    }
    if (!result) {
      setError('Could not get starting money from the server. Check your connection and try again.')
      setBusy(false)
      return
    }

    rememberStartingMoney(username, result.amount, result.tier)
    setAmount(result.amount)
    setTier(result.tier)
    setMessage(result.message)

    const wait = reduced ? 0 : Math.max(0, SPIN_MS - (Date.now() - t0))
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))

    try {
      if (reduced) {
        setLocking(7)
      } else {
        for (let i = 1; i <= 7; i += 1) {
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
      setLocking(7)
      setLanded(true)
      setBusy(false)
      try {
        burst(result.tier)
      } catch {
        /* ignore */
      }
    }
  }, [appearance, burst, dreamId, reduced, traits, username])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  const digits = digitsOf(amount)
  const badge = tier ? tierBadge(tier) : null

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
            <DigitReel finalDigit={digits[0] ?? '0'} locked={locking >= 1} reduced={reduced} />
            <span className={styles.comma}>,</span>
            <DigitReel finalDigit={digits[1] ?? '0'} locked={locking >= 2} reduced={reduced} />
            <DigitReel finalDigit={digits[2] ?? '0'} locked={locking >= 3} reduced={reduced} />
            <DigitReel finalDigit={digits[3] ?? '0'} locked={locking >= 4} reduced={reduced} />
            <span className={styles.comma}>,</span>
            <DigitReel finalDigit={digits[4] ?? '0'} locked={locking >= 5} reduced={reduced} />
            <DigitReel finalDigit={digits[5] ?? '0'} locked={locking >= 6} reduced={reduced} />
            <DigitReel finalDigit={digits[6] ?? '0'} locked={locking >= 7} reduced={reduced} />
          </div>
        )}

        {error ? (
          <div className={styles.actions}>
            <p className={styles.error} role="alert">
              {error}
            </p>
            <p className={styles.hint}>
              If it says 401, log out and log in again so the session cookie is set on this device.
            </p>
            <LobbyButton type="button" onClick={() => void run()}>
              Try again
            </LobbyButton>
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
            <LobbyButton type="button" onClick={() => onEnter(amount)}>
              Enter Ekpoma 🚀
            </LobbyButton>
          </div>
        ) : null}

        {busy && !error ? <p className={styles.message}>Spinning your start...</p> : null}
      </div>
    </div>
  )
}

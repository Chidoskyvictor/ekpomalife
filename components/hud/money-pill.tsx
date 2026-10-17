'use client'

import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Plus, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import styles from './life-hud.module.css'

export function MoneyPill({
  cash,
  onShop,
  onSettings,
}: {
  cash: number
  onShop: () => void
  onSettings: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const prev = useRef(cash)
  const [delta, setDelta] = useState<number | null>(null)

  useEffect(() => {
    const change = cash - prev.current
    prev.current = cash
    if (!change) return
    setDelta(change)
    const timer = window.setTimeout(() => setDelta(null), 1600)
    return () => window.clearTimeout(timer)
  }, [cash])

  return (
    <div className={styles.topRight}>
      <div className={styles.moneyRow}>
        <div className={`${styles.panel} ${styles.moneyPill}`}>
          <NumberFlow
            value={cash}
            prefix="₦"
            format={{ maximumFractionDigits: 0 }}
            locales="en-NG"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
          <AnimatePresence>
            {delta !== null ? (
              <motion.span
                key={`${delta}-${cash}`}
                className={`${styles.cashDelta} ${delta > 0 ? styles.cashUp : styles.cashDown}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
                transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}
              >
                {delta > 0 ? '+' : '−'}₦{Math.abs(delta).toLocaleString()}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <Button type="button" size="sm" aria-label="Open campus shop" onClick={onShop}>
          <Plus aria-hidden="true" />
        </Button>
        <button
          type="button"
          className={`${styles.panel} ${styles.settingsBtn}`}
          aria-label="Open settings"
          onClick={onSettings}
        >
          <Settings size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

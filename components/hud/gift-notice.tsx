'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { apiGet, apiPost } from '@/lib/api/client'
import { playSfx } from '@/lib/audio/sfx'
import { requestOpenBank } from '@/lib/game/open-bank'
import { hapticTap } from './haptic'
import styles from './gift-notice.module.css'

type Gift = { id: string; amount: number; title: string; message: string; signed: string | null }

const COINS = Array.from({ length: 10 }, (_, i) => i)

/**
 * Money Ekpoma Life already sent to your bank (e.g. sorry for the downtime). Shown once: it sits
 * under the Welcome back screen, so it appears as soon as you press Continue.
 */
export function GiftNotice() {
  const { state, isGuest } = useGame()
  const reduce = useReducedMotion() ?? false
  const [gift, setGift] = useState<Gift | null>(null)

  useEffect(() => {
    if (isGuest || !state) return
    let stale = false
    void apiGet<{ ok: true; gift: Gift | null }>('/gifts/unseen').then((res) => {
      if (stale || !res.ok || !res.gift) return
      setGift(res.gift)
      playSfx('coin')
      // Seen as soon as it's shown, so it never comes back
      void apiPost(`/gifts/${encodeURIComponent(res.gift.id)}/seen`, {})
    })
    return () => {
      stale = true
    }
    // Once per game load, when your game arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, Boolean(state)])

  const close = () => setGift(null)

  return (
    <BodyPortal>
      <AnimatePresence>
        {gift ? (
          <motion.div
            key="gift"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="gift-title"
              className={styles.card}
              onClick={(event) => event.stopPropagation()}
              initial={reduce ? false : { opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <div className={styles.hero} aria-hidden="true">
                {reduce
                  ? null
                  : COINS.map((i) => (
                      <motion.img
                        key={i}
                        src="/emoji/money-bag.png"
                        alt=""
                        className={styles.coin}
                        style={{ left: `${8 + i * 9}%` }}
                        initial={{ y: -40, opacity: 0, rotate: 0 }}
                        animate={{ y: [-40, 70 + (i % 3) * 18], opacity: [0, 1, 1, 0], rotate: (i % 2 ? 1 : -1) * 200 }}
                        transition={{ duration: 1.6, delay: 0.15 + i * 0.07, ease: 'easeIn' }}
                      />
                    ))}
                <img src="/logo.png" alt="" width={64} height={64} className={styles.logo} />
              </div>

              <p className={styles.kicker}>From Ekpoma Life</p>
              <h2 id="gift-title" className={styles.title}>
                {gift.title}
              </h2>
              <p className={styles.amount}>+₦{gift.amount.toLocaleString('en-NG')}</p>
              <p className={styles.message}>{gift.message} 💙</p>
              {gift.signed ? <p className={styles.signed}>— {gift.signed}</p> : null}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.bank}
                  onClick={() => {
                    hapticTap()
                    close()
                    requestOpenBank()
                  }}
                >
                  Check your bank
                </button>
                <button type="button" className={styles.later} onClick={close}>
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </BodyPortal>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import type { PhonePromo } from '@/lib/game/phone'
import styles from './phone.module.css'

export function PromoBanner({
  promos,
  onAction,
  lowPerf,
}: {
  promos: PhonePromo[]
  onAction: (promo: PhonePromo) => void
  lowPerf?: boolean
}) {
  const [index, setIndex] = useState(0)
  const paused = useRef(false)
  const list = promos.length ? promos : []

  useEffect(() => {
    if (list.length < 2) return
    const id = window.setInterval(() => {
      if (paused.current) return
      setIndex((i) => (i + 1) % list.length)
    }, 6000)
    return () => window.clearInterval(id)
  }, [list.length])

  if (!list.length) return null
  const promo = list[index]!

  return (
    <div
      className={styles.promo}
      onMouseEnter={() => {
        paused.current = true
      }}
      onMouseLeave={() => {
        paused.current = false
      }}
      onFocusCapture={() => {
        paused.current = true
      }}
      onBlurCapture={() => {
        paused.current = false
      }}
    >
      <article className={`${styles.promoCard} ${lowPerf ? styles.lowPerf : ''}`}>
        <span className={styles.promoEmoji} aria-hidden="true">
          {promo.emoji}
        </span>
        <div className={styles.promoBody}>
          <p className={styles.promoTitle}>{promo.title}</p>
          <p className={styles.promoSub}>{promo.subtitle}</p>
        </div>
        <button type="button" className={styles.promoCta} onClick={() => onAction(promo)}>
          {promo.cta}
        </button>
      </article>
      {list.length > 1 ? (
        <div className={styles.dots} role="tablist" aria-label="Promos">
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Promo ${i + 1}`}
              className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

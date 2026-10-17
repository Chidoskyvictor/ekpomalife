'use client'

import { motion, useReducedMotion } from 'motion/react'
import styles from './auth.module.css'

const STICKERS = [
  { emoji: '📚', x: '8%', y: '22%', duration: 14 },
  { emoji: '🛵', x: '86%', y: '18%', duration: 16 },
  { emoji: '🍛', x: '12%', y: '72%', duration: 15 },
  { emoji: '🎧', x: '82%', y: '68%', duration: 13 },
] as const

export function FloatingStickers() {
  const reduce = useReducedMotion() ?? false
  return (
    <div className={styles.stickers} aria-hidden="true">
      {STICKERS.map((item) => (
        <motion.span
          key={item.emoji}
          className={styles.sticker}
          style={{ left: item.x, top: item.y }}
          animate={reduce ? { y: 0, opacity: 0.28 } : { y: [0, -14, 0], opacity: 0.28 }}
          transition={reduce ? { duration: 0 } : { duration: item.duration, repeat: Infinity, ease: 'easeInOut' }}
        >
          {item.emoji}
        </motion.span>
      ))}
    </div>
  )
}

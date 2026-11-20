'use client'

import type { Card, Shape } from '@/lib/game/whot-rules'
import { specialOf } from '@/lib/game/whot-rules'
import styles from './whot.module.css'

/** Printed colours of a Nigerian Whot pack (cream card, one colour per shape). */
export const SHAPE_INK: Record<Shape, string> = {
  circle: '#d62f2a',
  triangle: '#16864a',
  cross: '#2f55c8',
  square: '#d6336c',
  star: '#e0a000',
  whot: '#b3201c',
}

export const SHAPE_NAME: Record<Shape, string> = {
  circle: 'Circle',
  triangle: 'Triangle',
  cross: 'Cross',
  square: 'Square',
  star: 'Star',
  whot: 'Whot',
}

const SPECIAL_LABEL: Record<string, string> = {
  'hold-on': 'HOLD ON',
  'pick-two': 'PICK 2',
  'pick-three': 'PICK 3',
  suspension: 'SUSPENSION',
  'general-market': 'GENERAL MARKET',
}

/** One printed shape on a 48×48 grid. Used big in the middle and tiny in the corners. */
export function ShapeMark({ shape, size, className }: { shape: Shape; size: number; className?: string }) {
  const ink = SHAPE_INK[shape]
  const dark = 'rgb(0 0 0 / 0.28)'
  const common = { className, width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true } as const
  switch (shape) {
    case 'circle':
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="19" fill={ink} stroke={dark} strokeWidth="1.5" />
          <circle cx="24" cy="24" r="12" fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="2" />
        </svg>
      )
    case 'triangle':
      return (
        <svg {...common}>
          <polygon points="24,4 45,42 3,42" fill={ink} stroke={dark} strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points="24,16 36,37 12,37" fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )
    case 'cross':
      return (
        <svg {...common}>
          <path
            d="M18 3h12v15h15v12H30v15H18V30H3V18h15z"
            fill={ink}
            stroke={dark}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M21 9h6v12h12v6H27v12h-6V27H9v-6h12z" fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth="1.5" />
        </svg>
      )
    case 'square':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="36" height="36" rx="4" fill={ink} stroke={dark} strokeWidth="1.5" />
          <rect x="13" y="13" width="22" height="22" rx="2" fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="2" />
        </svg>
      )
    case 'star':
      return (
        <svg {...common}>
          <polygon
            points="24,3 30,17.5 45.5,18.5 33.5,28.5 37.5,43.5 24,35 10.5,43.5 14.5,28.5 2.5,18.5 18,17.5"
            fill={ink}
            stroke="rgb(120 80 0 / 0.55)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )
    default:
      return null
  }
}

function Corner({ card, pos }: { card: Card; pos: 'tl' | 'br' }) {
  return (
    <div className={`${styles.corner} ${pos === 'tl' ? styles.cornerTl : styles.cornerBr}`} style={{ color: SHAPE_INK[card.shape] }}>
      <span className={styles.cornerNum}>{card.num}</span>
      <ShapeMark shape={card.shape} size={12} />
    </div>
  )
}

export type CardSize = 'hand' | 'pile' | 'mini'

/** The face of a card. `called` shows the shape demanded after a Whot 20. */
export function CardFace({
  card,
  size = 'hand',
  called,
  playable,
  className,
}: {
  card: Card
  size?: CardSize
  called?: Shape | null
  playable?: boolean
  className?: string
}) {
  const kind = specialOf(card)
  const label = kind ? SPECIAL_LABEL[kind] : null
  const whot = card.shape === 'whot'
  return (
    <div
      className={`${styles.card} ${styles[`size_${size}`]} ${whot ? styles.cardWhot : ''} ${playable ? styles.cardPlayable : ''} ${className ?? ''}`}
      data-shape={card.shape}
    >
      {whot ? (
        <div className={styles.whotFace}>
          <span className={styles.whotWord}>WHOT</span>
          <span className={styles.whotNum}>20</span>
          <div className={styles.whotShapes} aria-hidden>
            {(['circle', 'triangle', 'cross', 'square', 'star'] as Shape[]).map((s) => (
              <ShapeMark key={s} shape={s} size={size === 'mini' ? 6 : 10} />
            ))}
          </div>
          <span className={`${styles.whotNum} ${styles.whotNumFlip}`}>20</span>
        </div>
      ) : (
        <>
          <Corner card={card} pos="tl" />
          <Corner card={card} pos="br" />
          <div className={styles.centre}>
            <ShapeMark shape={card.shape} size={size === 'mini' ? 22 : size === 'pile' ? 52 : 40} />
          </div>
          {label && size !== 'mini' ? <span className={styles.badge}>{label}</span> : null}
        </>
      )}
      {called ? (
        <span className={styles.calledChip} title={`Needs ${SHAPE_NAME[called]}`}>
          <ShapeMark shape={called} size={size === 'mini' ? 10 : 16} />
        </span>
      ) : null}
    </div>
  )
}

export function CardBack({ className }: { className?: string }) {
  return (
    <div className={`${styles.card} ${styles.size_hand} ${styles.cardBack} ${className ?? ''}`} aria-hidden>
      <div className={styles.backInner}>
        <span>WHOT</span>
      </div>
    </div>
  )
}

/** A tiny face-down card used to show how many cards an opponent holds. */
export function MiniBack() {
  return <span className={styles.miniBack} aria-hidden />
}

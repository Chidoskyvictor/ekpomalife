'use client'

import type { WhotCardView } from '@/lib/game/whot-api'
import styles from './whot.module.css'

/** Classic Nigerian Whot suit colours (Papilo-style deck). */
const SUIT: Record<
  string,
  { ink: string; fill: string; name: string }
> = {
  Circle: { ink: '#c62828', fill: '#ef5350', name: 'Circle' },
  Triangle: { ink: '#2e7d32', fill: '#66bb6a', name: 'Triangle' },
  Cross: { ink: '#1565c0', fill: '#42a5f5', name: 'Cross' },
  Square: { ink: '#212121', fill: '#424242', name: 'Square' },
  Star: { ink: '#f57f17', fill: '#ffca28', name: 'Star' },
  Whot: { ink: '#1a1a1a', fill: '#c62828', name: 'Whot' },
}

const SPECIAL: Record<string, string> = {
  PickTwo: 'Pick 2',
  PickThree: 'Pick 3',
  HoldOn: 'Hold on',
  Suspension: 'Suspend',
  GeneralMarket: 'Gen. market',
}

function moveLabel(card: WhotCardView) {
  if (card.move && card.move !== 'None') return SPECIAL[card.move] ?? null
  return null
}

function displayNumber(card: WhotCardView) {
  if (card.shape === 'Whot') return '20'
  return String(card.value)
}

type GlyphProps = { shape: string; size: number; className?: string }

/** Large centre suit mark — matches how the physical deck reads at a glance. */
export function WhotShapeGlyph({ shape, size, className }: GlyphProps) {
  const suit = SUIT[shape] ?? SUIT.Square
  const s = size
  const c = suit.fill
  const stroke = suit.ink

  if (shape === 'Circle') {
    return (
      <svg className={className} width={s} height={s} viewBox="0 0 48 48" aria-hidden>
        <circle cx="24" cy="24" r="18" fill={c} stroke={stroke} strokeWidth="2" />
        <circle cx="24" cy="24" r="8" fill="#fff" opacity="0.35" />
      </svg>
    )
  }
  if (shape === 'Triangle') {
    return (
      <svg className={className} width={s} height={s} viewBox="0 0 48 48" aria-hidden>
        <polygon points="24,6 44,42 4,42" fill={c} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    )
  }
  if (shape === 'Cross') {
    return (
      <svg className={className} width={s} height={s} viewBox="0 0 48 48" aria-hidden>
        <rect x="18" y="6" width="12" height="36" rx="2" fill={c} stroke={stroke} strokeWidth="1.5" />
        <rect x="6" y="18" width="36" height="12" rx="2" fill={c} stroke={stroke} strokeWidth="1.5" />
      </svg>
    )
  }
  if (shape === 'Square') {
    return (
      <svg className={className} width={s} height={s} viewBox="0 0 48 48" aria-hidden>
        <rect x="8" y="8" width="32" height="32" rx="3" fill="none" stroke={stroke} strokeWidth="4" />
        <rect x="14" y="14" width="20" height="20" rx="2" fill={c} opacity="0.35" />
      </svg>
    )
  }
  if (shape === 'Star') {
    return (
      <svg className={className} width={s} height={s} viewBox="0 0 48 48" aria-hidden>
        <polygon
          points="24,4 29,18 44,18 32,28 37,42 24,33 11,42 16,28 4,18 19,18"
          fill={c}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return null
}

function CornerIndex({ card, corner }: { card: WhotCardView; corner: 'tl' | 'br' }) {
  const suit = SUIT[card.shape] ?? SUIT.Square
  const num = displayNumber(card)
  return (
    <div
      className={`${styles.cardCorner} ${corner === 'tl' ? styles.cornerTl : styles.cornerBr}`}
      style={{ color: suit.ink }}
    >
      <span className={styles.cornerNum}>{num}</span>
      <WhotShapeGlyph shape={card.shape} size={14} />
    </div>
  )
}

function WhotTwentyFace({ iNeed }: { iNeed?: string }) {
  return (
    <div className={styles.whotFace}>
      <div className={styles.whotStripe} aria-hidden />
      <span className={styles.whotTitle}>WHOT</span>
      <span className={styles.whotNum}>20</span>
      {iNeed ? (
        <div className={styles.whotNeed}>
          <span>Needs</span>
          <WhotShapeGlyph shape={iNeed} size={22} />
        </div>
      ) : null}
    </div>
  )
}

function StandardFace({ card }: { card: WhotCardView }) {
  const special = moveLabel(card)
  return (
    <>
      <CornerIndex card={card} corner="tl" />
      <CornerIndex card={card} corner="br" />
      <div className={styles.cardCenter}>
        <WhotShapeGlyph shape={card.shape} size={36} className={styles.centerGlyph} />
      </div>
      {special ? <span className={styles.cardSpecial}>{special}</span> : null}
      {card.iNeed && card.shape !== 'Whot' ? (
        <div className={styles.calledShape}>
          <WhotShapeGlyph shape={card.iNeed} size={16} />
        </div>
      ) : null}
    </>
  )
}

export function WhotCardBack({ className }: { className?: string }) {
  return (
    <div className={`${styles.cardFace} ${styles.cardBack} ${className ?? ''}`} aria-hidden>
      <div className={styles.backPattern} />
      <span className={styles.backLabel}>WHOT</span>
    </div>
  )
}

/** Mini card used for shape picker (play Whot → call a suit). */
export function WhotShapePickerCard({ shape, onClick }: { shape: string; onClick: () => void }) {
  const fake: WhotCardView = { value: 1, shape }
  return (
    <button type="button" className={styles.shapePickBtn} onClick={onClick} aria-label={`Call ${shape}`}>
      <WhotCardFace card={fake} size="mini" />
    </button>
  )
}

export function WhotCardFace({
  card,
  size = 'hand',
}: {
  card: WhotCardView
  size?: 'hand' | 'pile' | 'mini'
}) {
  const isWhot = card.shape === 'Whot'
  return (
    <div
      className={`${styles.cardFace} ${styles[`cardSize_${size}`]} ${isWhot ? styles.cardFaceWhot : ''}`}
      data-shape={card.shape}
    >
      {isWhot ? <WhotTwentyFace iNeed={card.iNeed} /> : <StandardFace card={card} />}
    </div>
  )
}

/** @deprecated use WhotShapeGlyph */
export function WhotShape({ shape }: { shape: string }) {
  return <WhotShapeGlyph shape={shape} size={22} className={styles.shape} />
}

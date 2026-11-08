'use client'

import type { HomeItem, HomeStyle } from '@/lib/game/home-buy-api'
import { aboutNaira, styleIcons, type StyleQuote } from '@/lib/game/home-style'
import styles from './buy-panel.module.css'

/**
 * Buy mode's Styles tab: ready-made looks. Tap one to try it on in the room (free), then Buy.
 * Your own matching pieces are moved into place; only the missing ones are paid for.
 */
export function StylesGrid({
  list,
  catalog,
  quotes,
  cash,
  onTry,
}: {
  list: HomeStyle[]
  catalog: HomeItem[]
  quotes: Map<string, StyleQuote>
  cash: number
  onTry: (style: HomeStyle) => void
}) {
  return (
    <>
      <p className={styles.styleIntro}>
        One tap gives a whole look. Try it on first: pieces you already own are reused where they fit, and you pay only for what is missing.
      </p>
      <div className={styles.styleGrid}>
        {list.length === 0 ? <p className={styles.hint}>No styles yet.</p> : null}
        {list.map((style) => {
          const quote = quotes.get(style.id)
          return (
            <button key={style.id} type="button" className={styles.styleCard} onClick={() => onTry(style)}>
              <span className={styles.styleIcons} aria-hidden="true">
                {styleIcons(style, catalog).map((e, i) => (
                  <span key={`${e}${i}`}>{e}</span>
                ))}
              </span>
              <strong className={styles.cardName}>{style.name}</strong>
              <span className={styles.styleBlurb}>{style.blurb}</span>
              <span className={quote && quote.total > cash ? styles.priceShort : styles.price}>{quote ? aboutNaira(quote.total) : ''}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/** The sheet while a style is being tried on: what it adds, the price, Cancel or Buy. */
export function StylePreview({
  style,
  quote,
  catalog,
  cash,
  busy,
  note,
  onBuy,
  onCancel,
}: {
  style: HomeStyle
  quote: StyleQuote
  catalog: HomeItem[]
  cash: number
  busy: boolean
  note?: string
  onBuy: () => void
  onCancel: () => void
}) {
  const names = new Map(catalog.map((i) => [i.id, i.name]))
  const { plan } = quote
  const nothing = plan.buys.length === 0 && plan.moves.length === 0 && quote.decorCost === 0
  const short = quote.total > cash
  const status = note
    ? note
    : nothing
      ? 'Nothing to change: you already have this look, or nothing fits.'
      : short
        ? `${aboutNaira(quote.total - cash).replace('about ', '')} more to go.`
        : `${plan.buys.length} new · ${plan.moves.length} yours reused${plan.skipped.length ? ` · ${plan.skipped.length} won’t fit` : ''}`
  return (
    <div className={styles.placing}>
      <div className={styles.placingHead}>
        <span className={styles.placingIcon} aria-hidden="true">
          {style.emoji}
        </span>
        <span className={styles.placingText}>
          <strong>{style.name}</strong>
          <span role="status">{status}</span>
        </span>
      </div>
      <p className={styles.styleAdds}>
        {plan.buys.length > 0 ? `Adds: ${[...new Set(plan.buys.map((b) => names.get(b.itemId) ?? b.itemId))].join(', ')}` : 'Nothing new to buy.'}
        {quote.decorCost > 0 ? ` · New ${[quote.decor.wall ? 'wall paint' : '', quote.decor.floor ? 'floor' : ''].filter(Boolean).join(' and ')}.` : ''}
      </p>
      <div className={styles.twoUp}>
        <button type="button" className={styles.pill} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`${styles.go} ${styles.goFlex}`} disabled={busy || short || nothing} onClick={onBuy}>
          Buy · {aboutNaira(quote.total)}
        </button>
      </div>
    </div>
  )
}

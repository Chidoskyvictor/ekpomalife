'use client'

import type { HomeItem, HomeStyle } from '@/lib/game/home-buy-api'
import type { StyleScope } from '@/lib/game/home-style-layout'
import { aboutNaira, styleItems, stylePalette, type StyleQuote } from '@/lib/game/home-style'
import styles from './buy-panel.module.css'
import { ItemPic } from './item-pic'

/**
 * Buy mode's Styles tab: ready-made looks. Tap one to try it on in the room (free), then Use.
 * Your own matching pieces are moved into place; only the missing ones are paid for.
 */
export function StylesGrid({
  list,
  catalog,
  quotes,
  cash,
  selectedId,
  onTry,
}: {
  list: HomeStyle[]
  catalog: HomeItem[]
  quotes: Map<string, StyleQuote>
  cash: number
  selectedId?: string | null
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
          const pal = stylePalette(style)
          return (
            <button
              key={style.id}
              type="button"
              className={`${styles.styleCard} ${selectedId === style.id ? styles.styleCardOn : ''}`}
              aria-pressed={selectedId === style.id}
              onClick={() => onTry(style)}
            >
              {/* Banner in the style's own colours: wall on top, floor below, its pieces standing on it */}
              <span
                className={styles.styleBanner}
                aria-hidden="true"
                style={{ background: `linear-gradient(180deg, ${pal.wall} 0 58%, ${pal.floorA} 58% 79%, ${pal.floorB} 79% 100%)` }}
              >
                <span className={styles.styleThumbs}>
                  {styleItems(style, catalog).map((item) => (
                    <span key={item.id} className={styles.styleThumb}>
                      <ItemPic item={item} size={40} />
                    </span>
                  ))}
                </span>
                <span className={styles.styleBadge} style={{ background: pal.main }}>
                  {style.emoji}
                </span>
              </span>
              <span className={styles.styleBody}>
                <strong className={styles.styleName}>{style.name}</strong>
                <span className={styles.styleBlurb}>{style.blurb}</span>
                <strong className={quote && quote.total > cash ? styles.priceShort : styles.stylePrice}>{quote ? aboutNaira(quote.total) : ''}</strong>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/** The sheet while a style is being tried on: scope chips, what it does, the price, Back or Use. */
export function StylePreview({
  style,
  quote,
  catalog,
  cash,
  busy,
  scope,
  scopes,
  onScope,
  note,
  onUse,
  onBack,
}: {
  style: HomeStyle
  quote: StyleQuote
  catalog: HomeItem[]
  cash: number
  busy: boolean
  scope: StyleScope
  /** Only the rooms this home has (a single room offers just the whole room). */
  scopes: { id: StyleScope; label: string }[]
  onScope: (scope: StyleScope) => void
  note?: string
  onUse: () => void
  onBack: () => void
}) {
  const names = new Map(catalog.map((i) => [i.id, i.name]))
  const { plan } = quote
  const nothing = plan.buys.length === 0 && plan.moves.length === 0 && plan.toStorage.length === 0 && quote.decorCost === 0
  const short = quote.total > cash
  const status = note
    ? note
    : nothing
      ? 'Nothing to change here: you already have this look, or nothing fits.'
      : short
        ? `${aboutNaira(quote.total - cash).replace('about ', '')} more to go.`
        : `${plan.moves.length + plan.reused.length} of yours · ${plan.buys.length} new${plan.skipped.length ? ` · ${plan.skipped.length} won’t fit` : ''}`
  const paint = [quote.decor.wall ? 'walls' : '', quote.decor.floor ? 'floor' : ''].filter(Boolean).join(' and ')
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
      <div className={styles.scopes} role="radiogroup" aria-label="Where to apply it">
        {scopes.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scope === s.id}
            className={`${styles.chip} ${scope === s.id ? styles.chipOn : ''}`}
            onClick={() => onScope(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className={styles.styleAdds}>
        Preview: nothing is bought until you tap Use.
        {plan.buys.length > 0 ? ` Adds ${[...new Set(plan.buys.map((b) => names.get(b.itemId) ?? b.itemId))].join(', ')}.` : ''}
        {plan.toStorage.length > 0 ? ' The other pieces go to storage' : ''}
        {paint ? `${plan.toStorage.length > 0 ? ', and the' : ' The'} ${paint} change too.` : plan.toStorage.length > 0 ? '.' : ''}
      </p>
      <div className={styles.twoUp}>
        <button type="button" className={styles.pill} onClick={onBack}>
          Back
        </button>
        <button type="button" className={`${styles.go} ${styles.goFlex}`} disabled={busy || short || nothing} onClick={onUse}>
          Use · ₦{quote.total.toLocaleString('en-NG')}
        </button>
      </div>
    </div>
  )
}

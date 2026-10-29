'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useGame } from '@/hooks/use-game'
import { COMING_SOON } from '@/lib/game/place-info'
import base from './map-place-sheet.module.css'
import styles from './market-hub-sheet.module.css'

/**
 * Tap the Market Hub on the map: it is still being built, so this says what is coming
 * (real buying and selling, delivered for real) instead of offering a way to get there.
 */
export function MarketHubSheet({ hidden = false }: { hidden?: boolean }) {
  const { selectedId, select } = useGame()
  const info = selectedId ? COMING_SOON[selectedId] : null

  useEffect(() => {
    if (!info) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [info, select])

  if (!info || hidden) return null

  return (
    <section className={base.sheet} aria-label={`${info.title} details`}>
      <div className={base.handle} aria-hidden="true" />
      <header className={base.head}>
        <span className={base.icon} aria-hidden="true">
          🚧
        </span>
        <div className={base.titles}>
          <h2>{info.title}</h2>
          <p>
            {info.by}
            <span className={styles.pill}>Under construction</span>
          </p>
        </div>
        <button type="button" className={base.close} aria-label="Close" onClick={() => select(null)}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className={base.body}>
        <img
          src="/prodigy-market-hub.webp"
          alt="Prodigy Market Hub"
          width={340}
          height={222}
          className={styles.logo}
        />
        <p className={base.about}>{info.about}</p>

        <h3 className={base.sub}>What is coming</h3>
        <ul className={base.things}>
          {info.soon.map((line) => (
            <li key={line.text}>
              <span aria-hidden="true">{line.emoji}</span>
              {line.text}
            </li>
          ))}
        </ul>
        <p className={styles.note}>Nothing to buy here yet. Check back when the builders are done.</p>
      </div>
    </section>
  )
}

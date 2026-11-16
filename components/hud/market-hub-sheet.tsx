'use client'

import { Users } from 'lucide-react'
import { BottomSheet, SheetPill } from '@/components/ui/bottom-sheet'
import { useGame } from '@/hooks/use-game'
import { COMING_SOON } from '@/lib/game/place-info'
import base from './map-place-sheet.module.css'
import styles from './market-hub-sheet.module.css'

const MARKET_HUB_GROUP = 'https://chat.whatsapp.com/Gai8In9DMlF3G2vW9UzQvI?s=cl&p=a&mlu=4&ilr=4'

/**
 * Tap the Market Hub on the map: it is still being built, so this says what is coming
 * (real buying and selling, delivered for real) instead of offering a way to get there.
 */
export function MarketHubSheet({ hidden = false }: { hidden?: boolean }) {
  const { selectedId, select } = useGame()
  const info = selectedId ? COMING_SOON[selectedId] : null

  if (!info || hidden) return null

  return (
    <BottomSheet
      open
      onClose={() => select(null)}
      title={info.title}
      ariaLabel={`${info.title} details`}
      icon="🚧"
      subtitle={
        <>
          {info.by}
          <SheetPill tone="warn">Under construction</SheetPill>
        </>
      }
    >
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
        <a className={styles.join} href={MARKET_HUB_GROUP} target="_blank" rel="noopener noreferrer">
          <Users size={16} aria-hidden="true" /> Join our WhatsApp group
        </a>
    </BottomSheet>
  )
}

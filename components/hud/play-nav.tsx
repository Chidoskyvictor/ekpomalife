'use client'

import { House, Map, ShoppingBag, Smartphone, type LucideIcon } from 'lucide-react'
import styles from './play-nav.module.css'

export type PlayTab = 'home' | 'buy' | 'map' | 'phone'

const TABS: { id: PlayTab; Icon: LucideIcon; label: string }[] = [
  { id: 'home', Icon: House, label: 'Home' },
  { id: 'buy', Icon: ShoppingBag, label: 'Buy' },
  { id: 'map', Icon: Map, label: 'Map' },
  { id: 'phone', Icon: Smartphone, label: 'Phone' },
]

/**
 * The bottom bar: a floating white pill with Map raised in the middle as a big blue button
 * (it's how you get everywhere). The current tab is blue with a short line under it. With a
 * place sheet open it goes `compact`: icons only, so the sheet has more room.
 */
export function PlayNav({
  value,
  onValueChange,
  badges,
  phoneBatteryLow,
  compact = false,
}: {
  value: PlayTab
  onValueChange: (value: PlayTab) => void
  badges?: Partial<Record<PlayTab, number>>
  phoneBatteryLow?: boolean
  compact?: boolean
}) {
  return (
    <nav className={`${styles.nav} ${compact ? styles.compact : ''}`} aria-label="Play">
      <div className={styles.pill} role="tablist">
        {TABS.map(({ id, Icon, label }) => {
          const active = value === id
          const count = badges?.[id] ?? 0
          const isMap = id === 'map'
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={count > 0 ? `${label}, ${count} new` : label}
              className={`${styles.tab} ${isMap ? styles.mapTab : ''} ${active ? styles.active : ''}`}
              onClick={() => onValueChange(id)}
            >
              <span className={isMap ? styles.mapBubble : styles.icon}>
                <Icon
                  aria-hidden="true"
                  strokeWidth={isMap ? 2.4 : 2.2}
                  className={id === 'phone' && phoneBatteryLow ? styles.lowBattery : undefined}
                />
                {count > 0 ? (
                  <span className={styles.badge} aria-hidden="true">
                    {count > 9 ? '9+' : count}
                  </span>
                ) : null}
              </span>
              <span className={styles.label}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

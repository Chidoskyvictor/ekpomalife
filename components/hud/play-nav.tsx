'use client'

import { House, Map, ShoppingBag, Smartphone } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import lifeStyles from './life-hud.module.css'
import styles from './play-hud.module.css'

export type PlayTab = 'home' | 'buy' | 'map' | 'phone'

export function PlayNav({
  value,
  onValueChange,
  badges,
  phoneBatteryLow,
}: {
  value: PlayTab
  onValueChange: (value: PlayTab) => void
  badges?: Partial<Record<PlayTab, number>>
  phoneBatteryLow?: boolean
}) {
  return (
    <Tabs
      className={styles.nav}
      value={value}
      onValueChange={(next) => onValueChange(next as PlayTab)}
    >
      <TabsContent className={styles.navPanel} value="home" />
      <TabsContent className={styles.navPanel} value="buy" />
      <TabsContent className={styles.navPanel} value="map" />
      <TabsContent className={styles.navPanel} value="phone" />
      <TabsList aria-label="Play">
        {(
          [
            ['home', House, 'Home'],
            ['buy', ShoppingBag, 'Buy'],
            ['map', Map, 'Map'],
            ['phone', Smartphone, 'Phone'],
          ] as const
        ).map(([tab, Icon, label]) => {
          const count = badges?.[tab] ?? 0
          return (
            <TabsTrigger key={tab} className={`${styles.tabTrigger} ${lifeStyles.tabLift}`} value={tab}>
              <span className={lifeStyles.tabItem}>
                <Icon
                  aria-hidden="true"
                  className={tab === 'phone' && phoneBatteryLow ? 'text-red-500' : undefined}
                />
                {label}
                {count > 0 ? (
                  <span className={lifeStyles.tabBadge} aria-label={`${count} new`}>
                    {count > 9 ? '9+' : count}
                  </span>
                ) : null}
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

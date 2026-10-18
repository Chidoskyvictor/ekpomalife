'use client'

import { useEffect } from 'react'
import { ShopGrid } from '@/components/hud/shop-grid'
import { useEconomy } from '@/hooks/use-economy'
import styles from '../phone.module.css'

export function MarketApp() {
  const { shopItems, loadShop, loading } = useEconomy()

  useEffect(() => {
    void loadShop('town-shop-1')
  }, [loadShop])

  if (loading && shopItems.length === 0) {
    return <p className={styles.listMeta}>Loading market…</p>
  }

  return <ShopGrid items={shopItems} />
}

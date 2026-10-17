'use client'

import { useEffect } from 'react'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import { getPlace, getPlaceByZone } from '@/lib/game/places'
import { HudDrawer } from './hud-drawer'
import { InventoryPanel } from './inventory-panel'
import { ShopGrid } from './shop-grid'
import styles from './economy.module.css'

const FALLBACK_SHOP = 'town-shop-1'

function shopPlaceId(selectedId: string | null, locationId: string | null) {
  const selected = selectedId ? getPlace(selectedId) ?? getPlaceByZone(selectedId) : null
  if (selected && (selected.type === 'shop' || selected.type === 'food' || selected.id === 'bukka' || selected.id === 'market' || selected.id === 'town-shop-1')) {
    return selected.id
  }
  const here = locationId ? getPlace(locationId) ?? getPlaceByZone(locationId) : null
  if (here && (here.type === 'shop' || here.type === 'food')) return here.id
  return FALLBACK_SHOP
}

export function BuySheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, selectedId } = useGame()
  const { shopItems, loadShop, loading, loadInventory } = useEconomy()
  const placeId = shopPlaceId(selectedId, state?.locationId ?? null)
  const place = getPlace(placeId)

  useEffect(() => {
    if (!open) return
    void loadShop(placeId)
    void loadInventory()
  }, [open, placeId, loadShop, loadInventory])

  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={place?.label ?? 'Campus shop'}
      description="Buy what you need. Inventory is below."
    >
      <div className={styles.section}>
        <p className={styles.sectionTitle}>For sale</p>
        {loading && shopItems.length === 0 ? (
          <>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </>
        ) : (
          <ShopGrid items={shopItems} />
        )}
        <InventoryPanel />
      </div>
    </HudDrawer>
  )
}

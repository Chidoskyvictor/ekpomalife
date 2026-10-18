'use client'

import { FLOOR_PRICE, FURNITURE_CATALOG, PAINT_PRICE, ROOM_WALL_COLORS } from '@/lib/game/room-constants'
import type { FurnitureCategory, FurnitureItem, RoomState, RoomStyle } from '@/lib/game/room-types'
import { formatNaira } from '@/lib/game/live'
import styles from './room.module.css'

const CATS: { id: FurnitureCategory | 'bag' | 'style'; label: string }[] = [
  { id: 'sleep', label: 'Sleep' },
  { id: 'cooling', label: 'Cool' },
  { id: 'light', label: 'Light' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'study', label: 'Study' },
  { id: 'storage', label: 'Store' },
  { id: 'decor', label: 'Decor' },
  { id: 'power', label: 'Power' },
  { id: 'bag', label: 'Bag' },
  { id: 'style', label: 'Style' },
]

function comfortChips(item: FurnitureItem) {
  return Object.entries(item.comfort).map(([stat, value]) => (
    <span key={stat} className={styles.chip}>
      +{value} {stat === 'sleepQuality' ? 'sleep' : stat}
    </span>
  ))
}

export function RoomCatalog({
  room,
  cash,
  tab,
  onTab,
  storageCount,
  storageItems,
  busy,
  onBuy,
  onSelectStorage,
  draftStyle,
  onPreviewStyle,
  onConfirmStyle,
  ownedFloors,
}: {
  room: RoomState
  cash: number
  tab: string
  onTab: (tab: string) => void
  storageCount: number
  storageItems: { uid: string; itemId: string; name: string; emoji: string }[]
  busy: boolean
  onBuy: (itemId: string) => void
  onSelectStorage: (uid: string) => void
  draftStyle: RoomStyle
  onPreviewStyle: (patch: Partial<RoomStyle>) => void
  onConfirmStyle: () => void
  ownedFloors: Set<RoomStyle['floorId']>
}) {
  const tier = room.tier.tier
  const items =
    tab === 'storage' || tab === 'style'
      ? []
      : FURNITURE_CATALOG.filter((row) => row.category === tab)

  const paintCost =
    draftStyle.wallColor !== room.style.wallColor &&
    draftStyle.wallColor !== '#F2EDE4'
      ? PAINT_PRICE
      : 0
  const floorCost =
    draftStyle.floorId !== room.style.floorId && !ownedFloors.has(draftStyle.floorId)
      ? FLOOR_PRICE[draftStyle.floorId]
      : 0
  const styleTotal = paintCost + floorCost

  return (
    <div className={styles.sheet}>
      <div className={styles.tabs} role="tablist" aria-label="Room catalog">
        {CATS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`${styles.tab} ${tab === entry.id ? styles.tabOn : ''}`}
            onClick={() => onTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'bag' && storageCount > 0 ? ` (${storageCount})` : ''}
          </button>
        ))}
      </div>

      {tab === 'bag' ? (
        <div className={styles.grid}>
          {storageItems.length === 0 ? (
            <p className={styles.cardMeta}>Storage is empty. Buy something for your corner.</p>
          ) : (
            storageItems.map((row) => (
              <button
                key={row.uid}
                type="button"
                className={styles.card}
                disabled={busy}
                onClick={() => onSelectStorage(row.uid)}
              >
                <span className={styles.cardEmoji} aria-hidden="true">
                  {row.emoji}
                </span>
                <p className={styles.cardTitle}>{row.name}</p>
                <p className={styles.cardMeta}>Tap to place</p>
              </button>
            ))
          )}
        </div>
      ) : null}

      {tab === 'style' ? (
        <div className={styles.floorList}>
          <p className={styles.cardTitle}>Wall colour</p>
          <div className={styles.swatches}>
            {ROOM_WALL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Wall ${color}`}
                className={`${styles.swatch} ${draftStyle.wallColor === color ? styles.swatchOn : ''}`}
                style={{ background: color }}
                onClick={() => onPreviewStyle({ wallColor: color })}
              />
            ))}
          </div>
          <p className={styles.cardTitle}>Floor</p>
          {room.tier.floorOptions.map((floorId) => (
            <button
              key={floorId}
              type="button"
              className={styles.card}
              onClick={() => onPreviewStyle({ floorId })}
            >
              <p className={styles.cardTitle}>{floorId}</p>
              <p className={styles.cardMeta}>
                {ownedFloors.has(floorId) || floorId === 'cement'
                  ? 'Owned'
                  : formatNaira(FLOOR_PRICE[floorId])}
                {draftStyle.floorId === floorId ? ' · selected' : ''}
              </p>
            </button>
          ))}
          <button type="button" className={styles.primaryBtn} disabled={busy} onClick={onConfirmStyle}>
            {styleTotal === 0 ? 'Apply free' : `Paint for ${formatNaira(styleTotal)}`}
          </button>
        </div>
      ) : null}

      {tab !== 'bag' && tab !== 'style' ? (
        <div className={styles.grid}>
          {items.map((item) => {
            const locked = item.minTier > tier
            const short = !locked && cash < item.price
            return (
              <article
                key={item.id}
                className={`${styles.card} ${locked ? styles.cardLocked : ''}`}
              >
                <span className={styles.cardEmoji} aria-hidden="true">
                  {item.emoji}
                </span>
                <p className={styles.cardTitle}>{item.name}</p>
                <p className={styles.cardMeta}>
                  {locked
                    ? `Unlocks at tier ${item.minTier}`
                    : short
                      ? `${formatNaira(item.price - cash)} more to go`
                      : formatNaira(item.price)}
                </p>
                <div className={styles.chips}>{comfortChips(item)}</div>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  style={{ minHeight: 40, fontSize: '0.82rem' }}
                  disabled={busy || locked || short || item.price === 0}
                  onClick={() => onBuy(item.id)}
                >
                  {item.price === 0 ? 'Starter' : 'Buy'}
                </button>
              </article>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

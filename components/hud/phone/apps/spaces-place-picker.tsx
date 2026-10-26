'use client'

import { Check, ChevronLeft, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PLACES, type PlaceType } from '@/lib/game/places'
import { stickerForZone } from '@/lib/game/zone-stickers'
import { placeLabel } from './spaces-ui'
import styles from './spaces.module.css'

const TYPE_EMOJI: Record<PlaceType, string> = {
  campus: '🏫',
  hostel: '🛏️',
  food: '🍛',
  shop: '🛍️',
  transport: '🛺',
  leisure: '🎮',
  worship: '⛪',
  community: '🏘️',
}

/** The map sticker, or the type's emoji when the zone has no sticker (it falls back to a letter). */
const iconFor = (place: { zoneId: string; label: string; type: PlaceType }) => {
  const sticker = stickerForZone(place.zoneId, place.label)
  return /^[A-Za-z]$/.test(sticker) ? TYPE_EMOJI[place.type] : sticker
}

const TYPE_LABEL: Record<PlaceType, string> = {
  campus: 'Campus',
  hostel: 'Hostels',
  food: 'Food',
  shop: 'Shops',
  transport: 'Transport',
  leisure: 'Leisure',
  worship: 'Worship',
  community: 'Community',
}

/** "Pick a place": a page inside the phone (a native dropdown would draw outside the frame). */
export function SpacesPlacePicker({
  selected,
  onPick,
  onBack,
}: {
  selected: string | null
  onPick: (placeId: string) => void
  onBack: () => void
}) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = new Map<PlaceType, typeof PLACES>()
    for (const place of PLACES) {
      if (q && !place.label.toLowerCase().includes(q) && !TYPE_LABEL[place.type].toLowerCase().includes(q)) continue
      out.set(place.type, [...(out.get(place.type) ?? []), place])
    }
    for (const list of out.values()) list.sort((a, b) => (placeLabel(a.id) ?? '').localeCompare(placeLabel(b.id) ?? ''))
    return [...out.entries()]
  }, [query])

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <button type="button" className={styles.back} aria-label="Back" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 className={styles.title}>Pick a place</h2>
      </div>
      <div className={styles.screen}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input
            className={styles.searchInput}
            value={query}
            placeholder="Search places"
            aria-label="Search places"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {groups.length === 0 ? <p className={styles.empty}>No place matches “{query}”.</p> : null}
        {groups.map(([type, places]) => (
          <section key={type} className={styles.placeGroup}>
            <div className={styles.group}>{TYPE_LABEL[type]}</div>
            <ul className={styles.list}>
              {places.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    className={`${styles.placeRow} ${selected === place.id ? styles.placeRowOn : ''}`}
                    aria-pressed={selected === place.id}
                    onClick={() => onPick(place.id)}
                  >
                    <span className={styles.placeIcon} aria-hidden="true">
                      {iconFor(place)}
                    </span>
                    <span className={styles.placeName}>{placeLabel(place.id)}</span>
                    {selected === place.id ? <Check size={18} aria-label="Selected" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

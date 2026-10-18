'use client'

import { PLACES } from '@/lib/game/places'
import styles from '../phone.module.css'

export function MapApp({
  currentPlaceId,
  onGo,
  onRide,
}: {
  currentPlaceId: string | null
  onGo: (placeId: string) => void
  onRide: (placeId: string) => void
}) {
  const groups = new Map<string, typeof PLACES>()
  for (const place of PLACES) {
    const list = groups.get(place.type) ?? []
    list.push(place)
    groups.set(place.type, list)
  }

  return (
    <div>
      {[...groups.entries()].map(([type, places]) => (
        <section key={type}>
          <h3 className={styles.sectionTitle}>{type}</h3>
          <ul className={styles.list}>
            {places.map((place) => {
              const here = place.id === currentPlaceId
              return (
                <li key={place.id} className={styles.listItem}>
                  <div>
                    <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
                      {place.label}
                      {here ? ' · here' : ''}
                    </p>
                  </div>
                  {!here ? (
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={`${styles.smallPill} ${styles.smallPillGhost}`}
                        onClick={() => onGo(place.id)}
                      >
                        Go
                      </button>
                      <button
                        type="button"
                        className={styles.smallPill}
                        onClick={() => onRide(place.id)}
                      >
                        Ride
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

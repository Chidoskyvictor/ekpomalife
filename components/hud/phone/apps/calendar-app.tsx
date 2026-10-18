'use client'

import { RentCard } from '@/components/hud/rent-card'
import type { PhoneNotificationsResponse } from '@/lib/game/phone-api'
import styles from '../phone.module.css'

export function CalendarApp({
  items,
}: {
  items: PhoneNotificationsResponse['items']
}) {
  const calendarItems = items.filter((i) => i.appId === 'calendar')

  return (
    <div>
      <RentCard />
      <h3 className={styles.sectionTitle}>Agenda</h3>
      <ul className={styles.list}>
        <li className={styles.listItem}>
          <div>
            <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
              Lectures
            </p>
            <p className={styles.listMeta}>Coming soon — timetable wire-up</p>
          </div>
        </li>
        {calendarItems.map((item) => (
          <li key={item.id} className={styles.listItem}>
            <div>
              <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
                {item.title}
              </p>
              <p className={styles.listMeta}>{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

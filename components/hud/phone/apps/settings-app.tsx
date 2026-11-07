'use client'

import NumberFlow from '@number-flow/react'
import { useEffect, useRef, useState } from 'react'
import {
  DATA_BUNDLES,
  WALLPAPERS,
  type DataBundleId,
  type PhoneState,
  type WallpaperId,
} from '@/lib/game/phone'
import { fetchChatSettings, saveChatSettings } from '@/lib/game/hostels-api'
import { notificationsSupported, setNotifications, useNotificationsOn } from '@/lib/notify'
import styles from '../phone.module.css'

export function SettingsApp({
  phone,
  cash,
  placeId,
  onWallpaper,
  onBuyData,
  onCharge,
}: {
  phone: PhoneState
  cash: number
  placeId: string | null
  onWallpaper: (id: WallpaperId) => Promise<void>
  onBuyData: (id: DataBundleId) => Promise<{ ok: boolean; error?: string; message?: string }>
  onCharge: (action: 'start' | 'stop') => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const pendingKey = useRef<string | null>(null)

  return (
    <div>
      <h3 className={styles.sectionTitle}>Wallpaper</h3>
      <div className={styles.swatchRow}>
        {(Object.keys(WALLPAPERS) as WallpaperId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`${styles.swatch} ${phone.wallpaper === id ? styles.swatchActive : ''}`}
            style={{ background: WALLPAPERS[id].css }}
            aria-label={WALLPAPERS[id].label}
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                await onWallpaper(id)
                setBusy(false)
              })()
            }}
          />
        ))}
      </div>

      <h3 className={styles.sectionTitle}>
        Data · <NumberFlow value={phone.dataMb} suffix="MB" />
      </h3>
      <ul className={styles.list}>
        {DATA_BUNDLES.map((bundle) => (
          <li key={bundle.id} className={styles.listItem}>
            <div>
              <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
                {bundle.label}
              </p>
              <p className={styles.listMeta}>₦{bundle.price}</p>
            </div>
            <button
              type="button"
              className={styles.smallPill}
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  pendingKey.current = bundle.id
                  const res = await onBuyData(bundle.id)
                  setMsg(res.ok ? (res.message ?? 'Data loaded.') : (res.error ?? 'Could not buy data.'))
                  setBusy(false)
                })()
              }}
            >
              Buy
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.listMeta}>
        Cash <NumberFlow value={cash} prefix="₦" format={{ maximumFractionDigits: 0 }} />
      </p>

      <h3 className={styles.sectionTitle}>Notifications</h3>
      <NotificationsToggle onMessage={setMsg} />

      <h3 className={styles.sectionTitle}>Privacy</h3>
      <ReadReceiptsToggle onMessage={setMsg} />

      {msg ? <p className={styles.listMeta}>{msg}</p> : null}

      <h3 className={styles.sectionTitle}>Credits</h3>
      <p className={styles.listMeta}>
        Ride distances and times use map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap contributors
        </a>
        . App icons: Fluent Emoji by Microsoft.
      </p>
    </div>
  )
}

/** Background notifications (new chats, challenges). The permission prompt only follows this tap. */
function NotificationsToggle({ onMessage }: { onMessage: (msg: string | null) => void }) {
  const on = useNotificationsOn()
  const [busy, setBusy] = useState(false)
  if (!notificationsSupported()) return <p className={styles.listMeta}>This browser can&apos;t show notifications.</p>
  return (
    <ul className={styles.list}>
      <li className={styles.listItem}>
        <div>
          <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
            Background notifications
          </p>
          <p className={styles.listMeta}>New messages and challenges while the game is minimised</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={styles.smallPill}
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true)
              onMessage(await setNotifications(!on))
              setBusy(false)
            })()
          }}
        >
          {on ? 'On' : 'Off'}
        </button>
      </li>
    </ul>
  )
}

/** Blue ticks in Messages. Off = nobody sees when you read, and you don't see when they read yours. Saved on the server. */
function ReadReceiptsToggle({ onMessage }: { onMessage: (msg: string | null) => void }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    void fetchChatSettings().then((res) => {
      if (!cancelled) setOn(res.ok ? res.readReceipts : true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <ul className={styles.list}>
      <li className={styles.listItem}>
        <div>
          <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
            Read receipts
          </p>
          <p className={styles.listMeta}>If off, you won’t send or see blue ticks. Delivered still shows.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on ?? true}
          className={styles.smallPill}
          disabled={busy || on === null}
          onClick={() => {
            void (async () => {
              const next = !(on ?? true)
              setBusy(true)
              const res = await saveChatSettings(next)
              if (res.ok) setOn(res.readReceipts)
              else onMessage(res.error)
              setBusy(false)
            })()
          }}
        >
          {on === null ? '…' : on ? 'On' : 'Off'}
        </button>
      </li>
    </ul>
  )
}

'use client'

import NumberFlow from '@number-flow/react'
import { useRef, useState } from 'react'
import {
  BATTERY,
  DATA_BUNDLES,
  HOSTEL_PLACE_IDS,
  WALLPAPERS,
  type DataBundleId,
  type PhoneState,
  type WallpaperId,
} from '@/lib/game/phone'
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
  const atHostel = !!placeId && (HOSTEL_PLACE_IDS as readonly string[]).includes(placeId)

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

      <h3 className={styles.sectionTitle}>Battery</h3>
      <div className={styles.listItem}>
        <div>
          <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
            {phone.battery}%{phone.charging ? ' · charging' : ''}
            {phone.battery <= BATTERY.lowAt ? ' · low' : ''}
          </p>
          <p className={styles.listMeta}>
            Charge at hostel. Rechargeable lamp or gen = faster when NEPA take light.
          </p>
        </div>
        {phone.charging ? (
          <button
            type="button"
            className={`${styles.smallPill} ${styles.smallPillGhost}`}
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                await onCharge('stop')
                setBusy(false)
              })()
            }}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={styles.smallPill}
            disabled={busy || !atHostel}
            title={atHostel ? undefined : 'Charge for hostel'}
            onClick={() => {
              void (async () => {
                setBusy(true)
                await onCharge('start')
                setBusy(false)
              })()
            }}
          >
            Charge
          </button>
        )}
      </div>
      {msg ? <p className={styles.listMeta}>{msg}</p> : null}
    </div>
  )
}

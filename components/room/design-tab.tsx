'use client'

import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { buyHomeDecor, newIdempotencyKey, type HomeBuyFail } from '@/lib/game/home-buy-api'
import {
  DECOR_CUSTOM_PRICE,
  DECOR_FLOORS,
  DECOR_PAINTS,
  decorName,
  decorPrice,
  decorZones,
  floorColours,
  type DecorZone,
} from '@/lib/game/home-decor'
import { setOwnedDecor, stopTrying, tryDecor, useDecorUi } from '@/lib/game/home-decor-store'
import { ColourWheel } from './colour-wheel'
import styles from './design-tab.module.css'

const naira = (n: number) => `₦${n.toLocaleString()}`

const SECTION: Record<DecorZone, { title: string; custom: string }> = {
  wall: { title: 'Wall paint', custom: 'Mix your own colour' },
  floor: { title: 'Floor', custom: 'Floor in your own colour' },
  tiles: { title: 'Kitchen & bathroom tiles', custom: 'Kitchen & bath tiles in your own colour' },
}

/**
 * Buy mode's Design tab: wall paint, floor and (homes that have them) kitchen & bathroom tiles.
 * Tap one to try it on in the room above, then Buy. Visitors see your look too.
 */
export function DesignTab() {
  const { state, applyServerState, notifyToast } = useGame()
  const ui = useDecorUi()
  const cash = state?.cash ?? 0
  const [busy, setBusy] = useState(false)
  const key = useRef<string | null>(null)

  // Leaving the Design tab (or Buy mode) takes the try-on off
  useEffect(() => () => stopTrying(), [])

  // Which parts this home has (the server says too; this also works before it does)
  const zones = ui.zones.length ? ui.zones : decorZones(state?.lodgingId)
  const trying = ui.trying
  const price = trying ? decorPrice(trying.zone, trying.value) : null

  const buy = async () => {
    if (!trying || price === null || busy) return
    if (cash < price) {
      notifyToast('Not enough naira for that', false)
      return
    }
    setBusy(true)
    key.current ??= newIdempotencyKey()
    const res = await buyHomeDecor(trying.zone, trying.value, key.current)
    setBusy(false)
    if (!res.ok) {
      // Network blip: keep the key so a retry can't charge twice
      if (!(res as HomeBuyFail).network) key.current = null
      notifyToast(res.error || 'Could not change your home.', false)
      return
    }
    key.current = null
    setOwnedDecor(res.decor)
    stopTrying()
    applyServerState(res.state)
    notifyToast(res.message, true)
  }

  if (zones.length === 0) {
    return <p className={styles.note}>A hostel bunk can’t be decorated. Move to your own place to paint and tile it.</p>
  }

  return (
    <div className={styles.wrap}>
      {trying && price !== null ? (
        <div className={styles.trying} role="status">
          <span className={styles.tryingText}>
            <strong>Trying on {decorName(trying.zone, trying.value)}</strong>
            <span>Look at your house up there. Nothing’s paid yet.</span>
          </span>
          <button type="button" className={styles.cancel} onClick={stopTrying}>
            Cancel
          </button>
          <button type="button" className={styles.buy} disabled={busy || cash < price} onClick={() => void buy()}>
            {cash < price ? `Need ${naira(price)}` : `Buy ${naira(price)}`}
          </button>
        </div>
      ) : null}

      {zones.map((zone) => (
        <section key={zone} className={styles.section}>
          <h3 className={styles.head}>{SECTION[zone].title}</h3>
          <div className={styles.grid}>
            {(zone === 'wall' ? DECOR_PAINTS : DECOR_FLOORS).map((d) => {
              const owned = ui.owned[zone] === d.id
              const on = trying?.zone === zone && trying.value === d.id
              const pair = zone === 'wall' ? null : floorColours(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`${styles.swatch} ${on ? styles.swatchOn : ''}`}
                  aria-pressed={on}
                  onClick={() => (owned ? stopTrying() : tryDecor(zone, d.id))}
                >
                  <span
                    className={styles.chip}
                    style={
                      pair
                        ? { background: `conic-gradient(${pair[0]} 0 25%, ${pair[1]} 0 50%, ${pair[0]} 0 75%, ${pair[1]} 0)`, backgroundSize: '50% 50%' }
                        : { background: (d as { hex: string }).hex }
                    }
                    aria-hidden="true"
                  >
                    {owned ? <Check size={18} className={styles.ownedTick} /> : null}
                  </span>
                  <span className={styles.name}>{d.name}</span>
                  <span className={styles.price}>{owned ? 'Yours' : on ? 'Trying on' : naira(d.price)}</span>
                </button>
              )
            })}
          </div>
          <CustomColour zone={zone} label={SECTION[zone].custom} />
        </section>
      ))}
      <p className={styles.note}>Visitors see your paint and floors too. The floor goes everywhere except the kitchen and bathroom, which take their own tiles.</p>
    </div>
  )
}

/** "Your own colour": the wheel; every change is tried on straight away. */
function CustomColour({ zone, label }: { zone: DecorZone; label: string }) {
  const ui = useDecorUi()
  const owned = ui.owned[zone]
  const current = ui.trying?.zone === zone && ui.trying.value.startsWith('#') ? ui.trying.value : owned?.startsWith('#') ? owned : '#c8a27a'
  return (
    <div className={styles.custom}>
      <span className={styles.customText}>
        <strong>{label}</strong>
        <span>{naira(DECOR_CUSTOM_PRICE)} a colour</span>
      </span>
      <ColourWheel value={current} onChange={(hex) => tryDecor(zone, hex)} />
    </div>
  )
}

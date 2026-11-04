'use client'

import { useCallback, useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { fetchRentals, moveToRental, type Rental } from '@/lib/game/rentals-api'
import styles from '../phone.module.css'

const naira = (n: number) => `₦${n.toLocaleString()}`

/**
 * Houses: the places for rent in Ekpoma. Pick one, pay its move-in fee and move there; its weekly
 * rent starts fresh and your furniture comes with you.
 */
export function HousesApp() {
  const { state, notifyToast, refreshServer } = useGame()
  const [data, setData] = useState<{ houses: Rental[]; owesRent: boolean; nextMoveAt: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchRentals()
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setData({ houses: res.houses, owesRent: res.owesRent, nextMoveAt: res.nextMoveAt })
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const move = async (house: Rental) => {
    if (busy) return
    setBusy(true)
    const res = await moveToRental(house.id)
    setBusy(false)
    if (!res.ok) {
      notifyToast(res.error, false)
      return
    }
    notifyToast(res.message, true)
    setPicked(null)
    void refreshServer()
    void load()
  }

  if (error) return <p className={styles.listMeta}>{error}</p>
  if (!data) return <p className={styles.listMeta}>Loading places…</p>

  const cash = state?.cash ?? 0
  const blocked = data.owesRent
    ? 'Pay Baba Landlord what you owe before you move.'
    : data.nextMoveAt
      ? `You moved recently. You can move again on ${new Date(data.nextMoveAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}.`
      : null
  const current = data.houses.find((h) => h.current)

  return (
    <div>
      <h3 className={styles.sectionTitle}>Places for rent</h3>
      {blocked ? <p className={styles.listMeta}>{blocked}</p> : null}
      <ul className={styles.list}>
        {data.houses.map((h) => {
          const open = picked === h.id
          const short = cash < h.moveIn
          return (
            <li key={h.id} className={styles.listItem} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
                    {h.name}
                  </p>
                  <p className={styles.listMeta}>{h.address}</p>
                </div>
                {h.current ? (
                  <span className={styles.listMeta} style={{ fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap' }}>
                    Your home
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.smallPill}
                    disabled={busy || Boolean(blocked)}
                    onClick={() => setPicked(open ? null : h.id)}
                  >
                    {open ? 'Cancel' : 'Rent'}
                  </button>
                )}
              </div>
              <p className={styles.listMeta}>{h.about}</p>
              <p className={styles.listMeta}>
                Move-in {h.moveIn ? naira(h.moveIn) : 'free'} · Rent {naira(h.rentWeekly)} a week · {h.kitchen ? 'Own kitchen' : 'No kitchen'}
              </p>
              {open ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                  <p className={styles.listMeta} style={{ color: '#111' }}>
                    Move from your {current?.name.toLowerCase() ?? 'home'} to this {h.name.toLowerCase()}?{' '}
                    {h.moveIn ? `${naira(h.moveIn)} now, then ${naira(h.rentWeekly)} every week.` : `Free to move in, then ${naira(h.rentWeekly)} every week.`}{' '}
                    {h.decorate
                      ? 'Your furniture comes with you; anything that doesn’t fit is sold back at half price.'
                      : 'A hostel bunk can’t hold furniture: what you bought is sold back at half price.'}
                  </p>
                  <button
                    type="button"
                    className={styles.smallPill}
                    style={{ alignSelf: 'flex-start' }}
                    disabled={busy || short}
                    onClick={() => void move(h)}
                  >
                    {busy ? 'Moving…' : short ? `Need ${naira(h.moveIn)}` : 'Pay and move'}
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

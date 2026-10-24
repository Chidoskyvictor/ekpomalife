'use client'

import { useCallback, useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import {
  buyBusiness,
  buyLand,
  buyRide,
  fetchInvest,
  sellBusiness,
  sellLand,
  sellRide,
  type InvestView,
} from '@/lib/game/invest-api'
import { CryptoTab } from './invest-crypto'
import styles from './invest.module.css'

type Tab = 'land' | 'rides' | 'business' | 'crypto'

const TABS: { id: Tab; label: string; soon?: boolean }[] = [
  { id: 'land', label: '🌱 Land' },
  { id: 'rides', label: '🛺 Rides' },
  { id: 'business', label: '🏪 Businesses' },
  { id: 'crypto', label: '🪙 Crypto' },
]

/** ₦4.5m, ₦250k, ₦900 */
function short(n: number) {
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${sign}₦${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`
  if (a >= 1_000) return `${sign}₦${Math.round(a / 1_000)}k`
  return `${sign}₦${a}`
}

const full = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`
const signed = (n: number) => (n > 0 ? `+${short(n)}` : short(n))
const pct = (rate: number) => `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(1)}% a week`

/** Slim confirm row so nobody buys a ₦120m plot by accident. */
function Confirm({ label, busy, onYes, onNo }: { label: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className={styles.confirm}>
      <span>{label}</span>
      <button type="button" className={styles.ghost} onClick={onNo} disabled={busy}>
        Cancel
      </button>
      <button type="button" className={styles.primary} onClick={onYes} disabled={busy}>
        {busy ? '…' : 'Yes'}
      </button>
    </div>
  )
}

export function InvestApp() {
  const { refreshServer } = useGame()
  const [view, setView] = useState<InvestView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('land')
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)

  // Slow network? Try a couple more times before showing the error
  const load = useCallback(async () => {
    setError(null)
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetchInvest()
      if (res.ok) {
        setView(res.invest)
        return
      }
      if (attempt === 2 || !res.network) {
        setError(res.error)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (call: () => ReturnType<typeof buyLand>) => {
    setBusy(true)
    const res = await call()
    setBusy(false)
    setPending(null)
    if (res.ok) {
      setView(res.invest)
      setNotice({ text: res.message, ok: true })
      void refreshServer()
    } else {
      setNotice({ text: res.error, ok: false })
    }
  }

  if (!view) {
    return (
      <div className={styles.screen}>
        {error ? (
          <>
            <p className={styles.error}>{error}</p>
            <button type="button" className={styles.retry} onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <p className={styles.hint}>Loading your investments…</p>
        )}
      </div>
    )
  }

  const plots = view.myLand.length
  const rides = view.myRides.length
  const owned = view.myBusinesses.length
  const soon = TABS.find((t) => t.id === tab)?.soon

  return (
    <div className={styles.screen}>
      {/* Portfolio */}
      <section className={styles.hero}>
        <p className={styles.heroLabel}>Your money’s working</p>
        <p className={styles.heroValue}>{full(view.worth)}</p>
        <p className={styles.heroSub}>
          {plots} {plots === 1 ? 'plot' : 'plots'} · {rides} {rides === 1 ? 'ride' : 'rides'} · {owned}{' '}
          {owned === 1 ? 'business' : 'businesses'} · {full(view.cash)} cash
        </p>
        <div className={styles.stats}>
          {(
            [
              ['Today', view.today],
              ['This week', view.week],
              ['Total', view.total],
            ] as const
          ).map(([label, value]) => (
            <span key={label} className={styles.stat}>
              <span>{label}</span>
              <strong className={value < 0 ? styles.down : undefined}>{signed(value)}</strong>
            </span>
          ))}
        </div>
        <p className={styles.news}>📰 {view.news}</p>
        <p className={styles.heroFoot}>Next payout {view.nextPayout}</p>
      </section>

      {/* Tabs */}
      <div className={styles.tabs} role="tablist" aria-label="Investments">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
            onClick={() => {
              setTab(t.id)
              setPending(null)
            }}
          >
            {t.label}
            {t.soon ? <span className={styles.soonTag}>Soon</span> : null}
          </button>
        ))}
      </div>

      {notice ? (
        <p className={notice.ok ? styles.okNote : styles.errNote} role="status">
          {notice.text}
        </p>
      ) : null}

      {soon ? <p className={styles.hint}>Coming soon.</p> : null}

      {tab === 'crypto' ? (
        <CryptoTab
          onNotice={(text, ok) => {
            setNotice({ text, ok })
            void load()
          }}
        />
      ) : null}

      {/* —— Land —— */}
      {tab === 'land' ? (
        <>
          {view.myLand.length ? <h3 className={styles.section}>Your land</h3> : null}
          {view.myLand.map((land) => {
            const gain = land.value - land.boughtPrice
            const key = `sell-land:${land.id}`
            return (
              <article key={land.id} className={styles.card}>
                <span className={styles.icon} aria-hidden="true">
                  {land.emoji}
                </span>
                <div className={styles.body}>
                  <strong>{land.name}</strong>
                  <span>
                    Worth {full(land.value)} · <em className={gain < 0 ? styles.down : styles.up}>{signed(gain)}</em> on its{' '}
                    {short(land.boughtPrice)} price
                  </span>
                  <span className={styles.muted}>Grows ~{short(land.weeklyGrowth)} a week</span>
                  {pending === key ? (
                    <Confirm
                      label={`Sell for ${short(land.sellFor)}?`}
                      busy={busy}
                      onNo={() => setPending(null)}
                      onYes={() => void run(() => sellLand(land.id))}
                    />
                  ) : null}
                </div>
                {pending !== key ? (
                  <button type="button" className={styles.ghost} onClick={() => setPending(key)}>
                    Sell
                  </button>
                ) : null}
              </article>
            )
          })}
          {view.myLand.length ? (
            <p className={styles.fine}>Agents take {Math.round(view.agentFee * 100)}% when you sell.</p>
          ) : null}

          <h3 className={styles.section}>Buy land in Ekpoma</h3>
          {view.lands.map((area) => {
            const key = `buy-land:${area.id}`
            const soldOut = area.left <= 0
            return (
              <article key={area.id} className={styles.card}>
                <span className={styles.icon} aria-hidden="true">
                  {area.emoji}
                </span>
                <div className={styles.body}>
                  <strong>
                    {area.name} · <span className={styles.muted}>{area.plot}</span>
                  </strong>
                  <span>{area.blurb}</span>
                  <span className={styles.tags}>
                    <em className={area.weeklyRate < 0 ? styles.tagDown : styles.tagUp}>{pct(area.weeklyRate)}</em>
                    {area.risky ? <em className={styles.tagRisk}>land grabbers 😬</em> : null}
                    <em className={styles.tagPlain}>
                      {area.left}/{area.plots} plots left
                    </em>
                  </span>
                  {pending === key ? (
                    <Confirm
                      label={`Buy for ${full(area.price)}?`}
                      busy={busy}
                      onNo={() => setPending(null)}
                      onYes={() => void run(() => buyLand(area.id))}
                    />
                  ) : null}
                </div>
                {pending !== key ? (
                  <button
                    type="button"
                    className={styles.price}
                    disabled={soldOut}
                    onClick={() => setPending(key)}
                  >
                    {soldOut ? 'Sold out' : short(area.price)}
                  </button>
                ) : null}
              </article>
            )
          })}
        </>
      ) : null}

      {/* —— Businesses —— */}
      {tab === 'business' ? (
        <>
          {view.myBusinesses.length ? <h3 className={styles.section}>Your businesses</h3> : null}
          {view.myBusinesses.map((biz) => {
            const key = `sell-biz:${biz.id}`
            return (
              <article key={biz.id} className={styles.card}>
                <span className={styles.icon} aria-hidden="true">
                  {biz.emoji}
                </span>
                <div className={styles.body}>
                  <strong>{biz.name}</strong>
                  <span>
                    Paid you <em className={biz.earned < 0 ? styles.down : styles.up}>{signed(biz.earned)}</em> so far
                  </span>
                  <span className={styles.muted}>Sells for {short(biz.sellFor)} today</span>
                  {pending === key ? (
                    <Confirm
                      label={`Sell for ${short(biz.sellFor)}?`}
                      busy={busy}
                      onNo={() => setPending(null)}
                      onYes={() => void run(() => sellBusiness(biz.id))}
                    />
                  ) : null}
                </div>
                {pending !== key ? (
                  <button type="button" className={styles.ghost} onClick={() => setPending(key)}>
                    Sell
                  </button>
                ) : null}
              </article>
            )
          })}

          {(['own', 'stake'] as const).map((type) => (
            <div key={type} className={styles.group}>
              <h3 className={styles.section}>{type === 'own' ? 'Own a business' : 'Buy a stake in Ekpoma’s hot spots'}</h3>
              <p className={styles.fine}>
                {type === 'own'
                  ? 'Each one pays you every evening at 6 PM after running costs. Some days go wrong.'
                  : 'A share of the till at places on the map. The more people buy in, the busier they get.'}
              </p>
              {view.businesses
                .filter((biz) => biz.type === type)
                .map((biz) => {
                  const key = `buy-biz:${biz.id}`
                  const soldOut = biz.left === 0
                  const maxed = biz.owned >= biz.max
                  return (
                    <article key={biz.id} className={styles.card}>
                      <span className={styles.icon} aria-hidden="true">
                        {biz.emoji}
                      </span>
                      <div className={styles.body}>
                        <strong>{biz.name}</strong>
                        <span>{biz.blurb}</span>
                        <span className={styles.tags}>
                          <em className={styles.tagUp}>
                            Makes {short(biz.earnMin)}–{short(biz.earnMax)} a day
                          </em>
                          {biz.left !== null ? (
                            <em className={styles.tagPlain}>
                              {biz.left}/{biz.supply} stakes left
                            </em>
                          ) : null}
                          {biz.owned ? <em className={styles.tagPlain}>You have {biz.owned}</em> : null}
                        </span>
                        {pending === key ? (
                          <Confirm
                            label={`Buy for ${full(biz.price)}?`}
                            busy={busy}
                            onNo={() => setPending(null)}
                            onYes={() => void run(() => buyBusiness(biz.id))}
                          />
                        ) : null}
                      </div>
                      {pending !== key ? (
                        <button
                          type="button"
                          className={styles.price}
                          disabled={soldOut || maxed}
                          onClick={() => setPending(key)}
                        >
                          {soldOut ? 'Sold out' : maxed ? 'Max' : short(biz.price)}
                        </button>
                      ) : null}
                    </article>
                  )
                })}
            </div>
          ))}
        </>
      ) : null}

      {/* —— Rides —— */}
      {tab === 'rides' ? (
        <>
          {view.myRides.length ? <h3 className={styles.section}>Your rides</h3> : null}
          {view.myRides.map((ride) => {
            const key = `sell-ride:${ride.id}`
            return (
              <article key={ride.id} className={styles.card}>
                <span className={styles.icon} aria-hidden="true">
                  {ride.emoji}
                </span>
                <div className={styles.body}>
                  <strong>{ride.name}</strong>
                  <span>
                    Earned <em className={ride.earned < 0 ? styles.down : styles.up}>{signed(ride.earned)}</em> so far
                  </span>
                  <span className={styles.muted}>Sells for {short(ride.sellFor)} today</span>
                  {pending === key ? (
                    <Confirm
                      label={`Sell for ${short(ride.sellFor)}?`}
                      busy={busy}
                      onNo={() => setPending(null)}
                      onYes={() => void run(() => sellRide(ride.id))}
                    />
                  ) : null}
                </div>
                {pending !== key ? (
                  <button type="button" className={styles.ghost} onClick={() => setPending(key)}>
                    Sell
                  </button>
                ) : null}
              </article>
            )
          })}

          <h3 className={styles.section}>Put a ride on the road</h3>
          <p className={styles.fine}>Each ride pays every evening at 6 PM. Some days go wrong.</p>
          {view.rides.map((def) => {
            const key = `buy-ride:${def.kind}`
            const full_ = def.owned >= def.max
            return (
              <article key={def.kind} className={styles.card}>
                <span className={styles.icon} aria-hidden="true">
                  {def.emoji}
                </span>
                <div className={styles.body}>
                  <strong>{def.name}</strong>
                  <span>{def.blurb}</span>
                  <span className={styles.muted}>
                    Earns {short(def.earnMin)}–{short(def.earnMax)} a day, minus {short(def.riderPay)} for the rider. Sometimes
                    breaks down ({short(def.fixCost)} to fix).
                  </span>
                  {def.owned ? (
                    <span className={styles.muted}>
                      You run {def.owned} of {def.max}
                    </span>
                  ) : null}
                  {pending === key ? (
                    <Confirm
                      label={`Buy for ${full(def.price)}?`}
                      busy={busy}
                      onNo={() => setPending(null)}
                      onYes={() => void run(() => buyRide(def.kind))}
                    />
                  ) : null}
                </div>
                {pending !== key ? (
                  <button type="button" className={styles.price} disabled={full_} onClick={() => setPending(key)}>
                    {full_ ? 'Max' : short(def.price)}
                  </button>
                ) : null}
              </article>
            )
          })}
        </>
      ) : null}
    </div>
  )
}

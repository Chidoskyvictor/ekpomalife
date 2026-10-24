'use client'

import { ChevronLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { fetchCoin, fetchCoins, followCoin, launchCoin, tradeCoin, type CoinBag, type CoinCard, type CoinDetail } from '@/lib/game/crypto-api'
import { fetchTagged, type EtaPost } from '@/lib/game/eta-api'
import { GistList } from './eta-app'
import styles from './invest.module.css'

const full = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`
function short(n: number) {
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (a >= 1e9) return `${sign}₦${(a / 1e9).toFixed(1).replace(/\.0$/, '')}b`
  if (a >= 1e6) return `${sign}₦${(a / 1e6).toFixed(1).replace(/\.0$/, '')}m`
  if (a >= 1e3) return `${sign}₦${Math.round(a / 1e3)}k`
  return `${sign}₦${Math.round(a)}`
}
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
/** Prices are fractions of a naira: show 4 significant figures */
const price = (p: number) => `₦${p < 1 ? p.toPrecision(3) : p.toFixed(2)}`

const EMOJIS = ['🪙', '🚀', '🌸', '🍛', '🐐', '🔥', '💎', '🦁', '🎓', '🛺', '🌴', '👑']

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${36 - ((p - min) / span) * 32 - 2}`).join(' ')
  const up = points[points.length - 1]! >= points[0]!
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className={styles.spark} aria-hidden="true">
      <polyline points={d} fill="none" stroke={up ? '#0f766e' : '#c2410c'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function CryptoTab({ onNotice }: { onNotice: (text: string, ok: boolean) => void }) {
  const [coins, setCoins] = useState<CoinCard[] | null>(null)
  const [bags, setBags] = useState<CoinBag[]>([])
  const [fee, setFee] = useState(50_000)
  const [open, setOpen] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchCoins()
    if (res.ok) {
      setCoins(res.coins)
      setBags(res.mine)
      setFee(res.launchFee)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (open) return <CoinPage id={open} onBack={() => { setOpen(null); void load() }} onNotice={onNotice} />

  return (
    <>
      {launching ? (
        <LaunchForm
          fee={fee}
          onCancel={() => setLaunching(false)}
          onLaunched={(id, message) => {
            setLaunching(false)
            onNotice(message, true)
            setOpen(id)
          }}
          onError={(message) => onNotice(message, false)}
        />
      ) : (
        <button type="button" className={styles.launchBtn} onClick={() => setLaunching(true)}>
          🚀 Launch your own coin · {short(fee)}
        </button>
      )}

      {bags.length ? <h3 className={styles.section}>Your bags</h3> : null}
      {bags.map((bag) => {
        const gain = bag.value - bag.cost
        return (
          <button key={bag.coinId} type="button" className={styles.coinRow} onClick={() => setOpen(bag.coinId)}>
            <span className={styles.icon} aria-hidden="true">
              {bag.emoji}
            </span>
            <span className={styles.body}>
              <strong>${bag.ticker}</strong>
              <span className={styles.muted}>Worth {full(bag.value)}</span>
            </span>
            <em className={gain < 0 ? styles.tagDown : styles.tagUp}>{gain >= 0 ? '+' : ''}{short(gain)}</em>
          </button>
        )
      })}

      <h3 className={styles.section}>Trending on ẹta</h3>
      <p className={styles.fine}>Hype comes from followers, ẹta gist and buyers. High hype raises the odds of a pump. Nothing is guaranteed.</p>
      {!coins ? <p className={styles.hint}>Loading coins…</p> : null}
      {coins && !coins.length ? <p className={styles.hint}>No coins yet. Launch the first one in Ekpoma!</p> : null}
      {coins?.map((coin) => (
        <button key={coin.id} type="button" className={styles.coinRow} onClick={() => setOpen(coin.id)}>
          <span className={styles.icon} aria-hidden="true">
            {coin.emoji}
          </span>
          <span className={styles.body}>
            <strong>
              ${coin.ticker} <span className={styles.muted}>· {coin.name}</span>
            </strong>
            <span className={styles.muted}>
              {price(coin.price)} · cap {short(coin.marketCap)} · {coin.holders} holders
            </span>
          </span>
          <span className={styles.coinSide}>
            <em className={coin.change24h < 0 ? styles.tagDown : styles.tagUp}>{pct(coin.change24h)}</em>
            <span className={styles.hype}>🔥 {coin.hype}</span>
          </span>
        </button>
      ))}
    </>
  )
}

function LaunchForm({ fee, onCancel, onLaunched, onError }: {
  fee: number
  onCancel: () => void
  onLaunched: (id: string, message: string) => void
  onError: (message: string) => void
}) {
  const { refreshServer } = useGame()
  const [ticker, setTicker] = useState('')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0]!)
  const [description, setDescription] = useState('')
  const [devBuy, setDevBuy] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = /^[A-Za-z][A-Za-z0-9]{1,7}$/.test(ticker) && name.trim().length >= 2

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const res = await launchCoin({ ticker, name, emoji, description, devBuy: Number(devBuy.replace(/[^0-9]/g, '')) || 0 })
    setBusy(false)
    if (res.ok) {
      void refreshServer()
      onLaunched(res.coinId, res.message)
    } else {
      onError(res.error)
    }
  }

  return (
    <section className={styles.form}>
      <strong>Launch a coin</strong>
      <label className={styles.field}>
        <span>Ticker</span>
        <input value={ticker} maxLength={8} placeholder="JOLLOF" onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      </label>
      <label className={styles.field}>
        <span>Name</span>
        <input value={name} maxLength={24} placeholder="Jollof Coin" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className={styles.emojis} role="group" aria-label="Coin emoji">
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={`${styles.emojiPick} ${e === emoji ? styles.emojiOn : ''}`} onClick={() => setEmoji(e)} aria-pressed={e === emoji}>
            {e}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        <span>What’s it about?</span>
        <input value={description} maxLength={140} placeholder="The official coin of Ekpoma buka lovers" onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>Buy some yourself (optional, up to 10% of supply)</span>
        <input inputMode="numeric" value={devBuy} placeholder="₦0" onChange={(e) => setDevBuy(e.target.value)} />
      </label>
      <p className={styles.fine}>
        Launch fee {full(fee)}. You can’t sell your own coin for the first 6 hours. Every trade has a 1% fee.
      </p>
      <div className={styles.formBar}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={styles.primary} onClick={() => void submit()} disabled={!valid || busy}>
          {busy ? 'Launching…' : `Launch $${ticker || 'TICKER'}`}
        </button>
      </div>
    </section>
  )
}

function CoinPage({ id, onBack, onNotice }: { id: string; onBack: () => void; onNotice: (text: string, ok: boolean) => void }) {
  const { refreshServer } = useGame()
  const [coin, setCoin] = useState<CoinDetail | null>(null)
  const [posts, setPosts] = useState<EtaPost[]>([])
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchCoin(id)
    if (!res.ok) return onNotice(res.error, false)
    setCoin(res.coin)
    const talk = await fetchTagged(`coin:${res.coin.ticker.toLowerCase()}`)
    if (talk.ok) setPosts(talk.posts)
  }, [id, onNotice])

  useEffect(() => {
    void load()
  }, [load])

  const trade = async (side: 'buy' | 'sell', value: number) => {
    if (!coin || busy) return
    setBusy(true)
    const res = await tradeCoin(coin.id, side, value)
    setBusy(false)
    onNotice(res.ok ? res.message : res.error, res.ok)
    if (res.ok) {
      setAmount('')
      void refreshServer()
      void load()
    }
  }

  if (!coin) return <p className={styles.hint}>Loading coin…</p>
  const spend = Number(amount.replace(/[^0-9]/g, '')) || 0
  const locked = coin.mine && new Date(coin.creatorLockedUntil).getTime() > Date.now()

  return (
    <>
      <div className={styles.coinHead}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Back to coins">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className={styles.icon} aria-hidden="true">
          {coin.emoji}
        </span>
        <span className={styles.body}>
          <strong>${coin.ticker}</strong>
          <span className={styles.muted}>
            {coin.name}
            {coin.creator ? ` · by @${coin.creator}` : ''}
          </span>
        </span>
        <button
          type="button"
          className={coin.following ? styles.ghost : styles.primary}
          onClick={async () => {
            const res = await followCoin(coin.id)
            if (res.ok) setCoin({ ...coin, following: res.following, followers: coin.followers + (res.following ? 1 : -1) })
          }}
        >
          {coin.following ? 'Following' : 'Follow'}
        </button>
      </div>

      <section className={styles.coinStats}>
        <p className={styles.coinPrice}>
          {price(coin.price)} <em className={coin.change24h < 0 ? styles.down : styles.up}>{pct(coin.change24h)}</em>
        </p>
        <Spark points={coin.chart} />
        <p className={styles.muted}>
          Cap {short(coin.marketCap)} · {coin.holders} holders · {coin.followers} followers · hype 🔥 {coin.hype}
        </p>
        {coin.description ? <p className={styles.coinAbout}>{coin.description}</p> : null}
      </section>

      {coin.position ? (
        <section className={styles.card}>
          <div className={styles.body}>
            <strong>Your bag: {full(coin.position.value)}</strong>
            <span>
              {Math.round(coin.position.tokens).toLocaleString('en-NG')} ${coin.ticker} ·{' '}
              <em className={coin.position.value - coin.position.cost < 0 ? styles.down : styles.up}>
                {coin.position.value - coin.position.cost >= 0 ? '+' : ''}
                {short(coin.position.value - coin.position.cost)}
              </em>
            </span>
            {locked ? <span className={styles.muted}>Creator lock: you can sell after {new Date(coin.creatorLockedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span> : null}
            <span className={styles.sellRow}>
              {[0.25, 0.5, 1].map((share) => (
                <button key={share} type="button" className={styles.ghost} disabled={busy || locked} onClick={() => void trade('sell', share)}>
                  Sell {share === 1 ? 'all' : `${share * 100}%`}
                </button>
              ))}
            </span>
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <div className={styles.body}>
          <strong>Buy ${coin.ticker}</strong>
          <span className={styles.buyRow}>
            <input className={styles.amount} inputMode="numeric" placeholder="₦ amount" value={spend ? spend.toLocaleString('en-NG') : ''} onChange={(e) => setAmount(e.target.value)} />
            <button type="button" className={styles.primary} disabled={busy || spend < 1000} onClick={() => void trade('buy', spend)}>
              {busy ? '…' : 'Buy'}
            </button>
          </span>
          <span className={styles.sellRow}>
            {[5_000, 20_000, 100_000, 500_000].map((q) => (
              <button key={q} type="button" className={styles.ghost} onClick={() => setAmount(String(q))}>
                {short(q)}
              </button>
            ))}
          </span>
        </div>
      </section>

      <h3 className={styles.section}>${coin.ticker} community on ẹta</h3>
      <p className={styles.fine}>Post on ẹta with ${coin.ticker} in your gist to join the talk. More talk, more hype.</p>
      <GistList posts={posts} setPosts={setPosts} empty={`No gist about $${coin.ticker} yet. Start the hype on ẹta!`} />
    </>
  )
}

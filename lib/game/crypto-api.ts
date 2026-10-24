import { apiGet, apiPost } from '@/lib/api/client'

/** Player-made coins (Invest → Crypto). Mirrors backend/src/game/crypto.ts. */

export type CoinCard = {
  id: string
  ticker: string
  name: string
  emoji: string
  description: string
  price: number
  marketCap: number
  change24h: number
  hype: number
  followers: number
  holders: number
  createdAt: string
  following?: boolean
}

export type CoinBag = { coinId: string; ticker: string; emoji: string; tokens: number; value: number; cost: number }

export type CoinDetail = CoinCard & {
  creator: string | null
  mine: boolean
  creatorLockedUntil: string
  following: boolean
  chart: number[]
  position: { tokens: number; value: number; cost: number } | null
}

const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() })

export const fetchCoins = () => apiGet<{ ok: true; launchFee: number; coins: CoinCard[]; mine: CoinBag[] }>('/crypto')

export const fetchCoin = (id: string) => apiGet<{ ok: true; coin: CoinDetail }>(`/crypto/${encodeURIComponent(id)}`)

export const launchCoin = (input: { ticker: string; name: string; emoji: string; description: string; devBuy: number }) =>
  apiPost<{ ok: true; coinId: string; message: string }>('/crypto/launch', input, idem())

/** buy: naira to spend · sell: share of your bag (0–1] */
export const tradeCoin = (id: string, side: 'buy' | 'sell', amount: number) =>
  apiPost<{ ok: true; message: string }>(`/crypto/${encodeURIComponent(id)}/${side}`, { amount }, idem())

export const followCoin = (id: string) => apiPost<{ ok: true; following: boolean }>(`/crypto/${encodeURIComponent(id)}/follow`, {})

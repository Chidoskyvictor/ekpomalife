import { apiGet, apiPost } from '@/lib/api/client'

/** Invest app (land + rides). Mirrors backend/src/game/invest.ts `buildView`. */
export type InvestView = {
  cash: number
  day: number
  worth: number
  today: number
  week: number
  total: number
  news: string
  nextPayout: string
  agentFee: number
  myLand: {
    id: string
    areaId: string
    name: string
    emoji: string
    boughtPrice: number
    value: number
    weeklyGrowth: number
    sellFor: number
  }[]
  myRides: {
    id: string
    kind: string
    name: string
    emoji: string
    boughtPrice: number
    sellFor: number
    earned: number
  }[]
  myBusinesses: {
    id: string
    businessId: string
    name: string
    emoji: string
    type: 'own' | 'stake'
    boughtPrice: number
    sellFor: number
    earned: number
  }[]
  businesses: {
    id: string
    name: string
    emoji: string
    blurb: string
    type: 'own' | 'stake'
    price: number
    earnMin: number
    earnMax: number
    badLoss: number
    left: number | null
    supply: number | null
    owned: number
    max: number
  }[]
  lands: {
    id: string
    name: string
    plot: string
    emoji: string
    blurb: string
    risky: boolean
    price: number
    weeklyRate: number
    left: number
    plots: number
  }[]
  rides: {
    kind: string
    name: string
    emoji: string
    blurb: string
    price: number
    earnMin: number
    earnMax: number
    riderPay: number
    fixCost: number
    owned: number
    max: number
  }[]
}

type ActionOk = { ok: true; message: string; invest: InvestView }

const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() })

export const fetchInvest = () => apiGet<{ ok: true; invest: InvestView }>('/invest')

export const buyLand = (areaId: string) => apiPost<ActionOk>('/invest/land/buy', { areaId }, idem())
export const sellLand = (holdingId: string) => apiPost<ActionOk>('/invest/land/sell', { holdingId }, idem())
export const buyRide = (kind: string) => apiPost<ActionOk>('/invest/rides/buy', { kind }, idem())
export const sellRide = (holdingId: string) => apiPost<ActionOk>('/invest/rides/sell', { holdingId }, idem())
export const buyBusiness = (businessId: string) => apiPost<ActionOk>('/invest/business/buy', { businessId }, idem())
export const sellBusiness = (holdingId: string) => apiPost<ActionOk>('/invest/business/sell', { holdingId }, idem())

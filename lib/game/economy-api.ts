import { apiGet, apiPost, useMocks } from '@/lib/api/client'
import { friendlyApiMessage, type ApiFail } from '@/lib/api/errors'
import type { ServerGameState } from './game-api'
import * as mock from './economy-mock'

export type JobRequirements = {
  skill?: string
  level?: number
  course?: string
  trait?: string
  item?: string
  energy?: number
}

export type JobLevel = {
  level: number
  title: string
  payBonus: number
}

export type Job = {
  id: string
  title: string
  placeId: string
  payPerShift: number
  shiftMinutes: number
  needsCost: Partial<Record<'energy' | 'hunger' | 'hygiene' | 'fun' | 'social' | 'study', number>>
  requirements: JobRequirements
  levels: JobLevel[]
  /** Present when listing for the current player. */
  locked?: boolean
  lockReason?: string
  currentLevel?: number
}

export type ShopItem = {
  id: string
  name: string
  emoji: string
  price: number
  category: 'food' | 'phone' | 'toiletries' | 'books' | 'clothes' | 'licence' | 'other'
  effects?: {
    needs?: Partial<Record<'hunger' | 'energy' | 'hygiene' | 'fun' | 'social' | 'study', number>>
    item?: string
  }
  useActionId?: string
}

export type InventoryItem = {
  id: string
  itemId: string
  name: string
  emoji: string
  qty: number
  useActionId?: string | null
}

export type RentInfo = {
  lodgingId: string
  amount: number
  dueAt: string
  paidUntil: string
  status: 'ok' | 'due' | 'late' | 'evicted'
  label?: string
  warnings?: number
  lastWarnedAt?: string | null
  evictedAt?: string | null
  message?: string | null
}

export type Hustle = {
  id: string
  title: string
  hint: string
  placeId: string
  energyCost: number
  periods: string[]
  locked?: boolean
  lockReason?: string
}

export type LedgerEntry = {
  id: string
  amount: number
  reason: string
  kind?: string
  createdAt: string
  balanceAfter?: number
}

export type EconomyFail = ApiFail

type OkJobs = { ok: true; jobs: Job[]; currentJobId: string | null }
type OkApply = { ok: true; job: Job; message: string }
type OkShift = {
  ok: true
  state: ServerGameState
  earned: number
  xp: number
  levelUp?: boolean
  message: string
}
type OkShop = { ok: true; items: ShopItem[]; placeId: string }
type OkBuy = {
  ok: true
  state: ServerGameState
  inventory: InventoryItem[]
  message: string
  questComplete?: string
}
type OkInventory = { ok: true; items: InventoryItem[] }
type OkUse = {
  ok: true
  state: ServerGameState
  inventory: InventoryItem[]
  message: string
}
type OkRent = { ok: true; rent: RentInfo }
type OkPayRent = { ok: true; state: ServerGameState; rent: RentInfo; message: string }
type OkLedger = { ok: true; entries: LedgerEntry[]; cash: number; nextCursor?: string | null }
type OkHustles = {
  ok: true
  hustles: Hustle[]
  hustleLockoutUntil?: number | null
}
type OkHustleRun = {
  ok: true
  state: ServerGameState
  outcome: string
  earned: number
  fine: number
  message: string
}

export async function fetchJobs(placeId?: string | null): Promise<OkJobs | EconomyFail> {
  if (useMocks()) return mock.mockJobs(placeId)
  const query = placeId ? `?placeId=${encodeURIComponent(placeId)}` : ''
  return apiGet<OkJobs>(`/jobs${query}`)
}

export async function applyForJob(jobId: string): Promise<OkApply | EconomyFail> {
  if (useMocks()) return mock.mockApply(jobId)
  return apiPost<OkApply>('/jobs/apply', { jobId })
}

export async function workShift(): Promise<OkShift | EconomyFail> {
  if (useMocks()) return mock.mockShift()
  return apiPost<OkShift>('/jobs/shift')
}

export async function fetchShop(placeId: string): Promise<OkShop | EconomyFail> {
  if (useMocks()) return mock.mockShop(placeId)
  return apiGet<OkShop>(`/shop?placeId=${encodeURIComponent(placeId)}`)
}

export async function buyShopItem(itemId: string, qty: number): Promise<OkBuy | EconomyFail> {
  if (useMocks()) return mock.mockBuy(itemId, qty)
  return apiPost<OkBuy>('/shop/buy', { itemId, qty })
}

export async function fetchInventory(): Promise<OkInventory | EconomyFail> {
  if (useMocks()) return mock.mockInventory()
  return apiGet<OkInventory>('/inventory')
}

export async function useInventoryItem(itemId: string): Promise<OkUse | EconomyFail> {
  if (useMocks()) return mock.mockUseItem(itemId)
  return apiPost<OkUse>('/inventory/use', { itemId })
}

export async function fetchRent(): Promise<OkRent | EconomyFail> {
  if (useMocks()) return mock.mockRent()
  return apiGet<OkRent>('/rent')
}

export async function payRent(): Promise<OkPayRent | EconomyFail> {
  if (useMocks()) return mock.mockPayRent()
  return apiPost<OkPayRent>('/rent/pay')
}

export async function fetchLedger(
  limitOrOpts: number | { limit?: number; cursor?: string } = 20,
): Promise<OkLedger | EconomyFail> {
  const resolved =
    typeof limitOrOpts === 'number'
      ? { limit: limitOrOpts, cursor: undefined as string | undefined }
      : { limit: limitOrOpts.limit ?? 20, cursor: limitOrOpts.cursor }

  if (useMocks()) return mock.mockLedger(resolved.limit, resolved.cursor)

  const params = new URLSearchParams()
  params.set('limit', String(resolved.limit))
  if (resolved.cursor) params.set('cursor', resolved.cursor)
  return apiGet<OkLedger>(`/ledger?${params.toString()}`)
}

export async function fetchHustles(): Promise<OkHustles | EconomyFail> {
  if (useMocks()) return mock.mockHustles()
  return apiGet<OkHustles>('/hustles')
}

export async function runHustle(hustleId: string): Promise<OkHustleRun | EconomyFail> {
  if (useMocks()) return mock.mockRunHustle(hustleId)
  return apiPost<OkHustleRun>('/hustles/run', { hustleId })
}

export function friendlyEconomyError(fail: string | EconomyFail) {
  if (typeof fail === 'string') {
    return friendlyApiMessage({ ok: false, error: fail })
  }
  return friendlyApiMessage(fail)
}

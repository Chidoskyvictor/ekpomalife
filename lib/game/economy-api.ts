import { apiUrl } from './api'
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
  status: 'ok' | 'due' | 'late'
  label?: string
}

export type LedgerEntry = {
  id: string
  amount: number
  reason: string
  kind?: string
  createdAt: string
  balanceAfter?: number
}

export type EconomyFail = { ok: false; error: string }

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
type OkRent = { ok: true; rent: RentInfo }
type OkPayRent = { ok: true; state: ServerGameState; rent: RentInfo; message: string }
type OkLedger = { ok: true; entries: LedgerEntry[]; cash: number }

const FETCH_MS = 8000
const useForcedMock = () =>
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_USE_ECONOMY_MOCK === '1'

async function apiFetch(path: string, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_MS)
  try {
    return await fetch(`${apiUrl()}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function readJson<T>(response: Response): Promise<T | EconomyFail> {
  let data: T | EconomyFail
  try {
    data = (await response.json()) as T | EconomyFail
  } catch {
    return { ok: false, error: 'Network wahala, try again.' }
  }
  if (!response.ok || (typeof data === 'object' && data && 'ok' in data && data.ok === false)) {
    const fail = data as EconomyFail
    return { ok: false, error: fail.error || 'Network wahala, try again.' }
  }
  return data as T
}

async function withFallback<T extends { ok: true }>(
  live: () => Promise<T | EconomyFail>,
  fallback: () => Promise<T | EconomyFail> | T | EconomyFail,
): Promise<T | EconomyFail> {
  if (useForcedMock()) return fallback()
  try {
    const result = await live()
    if (
      !result.ok &&
      /Cannot reach|Network wahala|fetch|abort|404|Not Found|Failed to fetch|Request failed/i.test(
        result.error,
      )
    ) {
      return fallback()
    }
    return result
  } catch {
    return fallback()
  }
}

async function tryLive<T extends { ok: true }>(
  path: string,
  init?: RequestInit,
): Promise<T | EconomyFail> {
  try {
    const response = await apiFetch(path, init)
    if (response.status === 404) return { ok: false, error: 'Not Found' }
    return readJson<T>(response)
  } catch {
    return { ok: false, error: 'Network wahala, try again.' }
  }
}

export async function fetchJobs(placeId?: string | null): Promise<OkJobs | EconomyFail> {
  const query = placeId ? `?placeId=${encodeURIComponent(placeId)}` : ''
  return withFallback(() => tryLive<OkJobs>(`/jobs${query}`), () => mock.mockJobs(placeId))
}

export async function applyForJob(jobId: string): Promise<OkApply | EconomyFail> {
  return withFallback(
    () =>
      tryLive<OkApply>('/jobs/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      }),
    () => mock.mockApply(jobId),
  )
}

export async function workShift(): Promise<OkShift | EconomyFail> {
  return withFallback(
    () =>
      tryLive<OkShift>('/jobs/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    () => mock.mockShift(),
  )
}

export async function fetchShop(placeId: string): Promise<OkShop | EconomyFail> {
  return withFallback(
    () => tryLive<OkShop>(`/shop?placeId=${encodeURIComponent(placeId)}`),
    () => mock.mockShop(placeId),
  )
}

export async function buyShopItem(itemId: string, qty: number): Promise<OkBuy | EconomyFail> {
  return withFallback(
    () =>
      tryLive<OkBuy>('/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, qty }),
      }),
    () => mock.mockBuy(itemId, qty),
  )
}

export async function fetchInventory(): Promise<OkInventory | EconomyFail> {
  return withFallback(() => tryLive<OkInventory>('/inventory'), () => mock.mockInventory())
}

export async function fetchRent(): Promise<OkRent | EconomyFail> {
  return withFallback(() => tryLive<OkRent>('/rent'), () => mock.mockRent())
}

export async function payRent(): Promise<OkPayRent | EconomyFail> {
  return withFallback(
    () =>
      tryLive<OkPayRent>('/rent/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    () => mock.mockPayRent(),
  )
}

export async function fetchLedger(limit = 20): Promise<OkLedger | EconomyFail> {
  return withFallback(
    () => tryLive<OkLedger>(`/ledger?limit=${limit}`),
    () => mock.mockLedger(limit),
  )
}

export function friendlyEconomyError(error: string) {
  if (/network|reach|abort|fetch|failed/i.test(error)) return 'Network wahala, try again.'
  return error || 'Network wahala, try again.'
}

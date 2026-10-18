import { apiGet, apiPatch, apiPost, useMocks } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import {
  mockBuyData,
  mockCharge,
  mockGetPhone,
  mockListNotifications,
  mockOpenApp,
  mockRideQuote,
  mockSetWallpaper,
  mockTakeRide,
} from '@/lib/game/phone-mock'
import { DATA_BUNDLES, type DataBundleId, type PhoneAppId, type PhoneClock, type PhonePromo, type PhoneState, type RideMode, type WallpaperId } from '@/lib/game/phone'

export type PhoneLocation = {
  placeId: string | null
  label: string
  town: 'Ekpoma, Edo'
}

export type PhoneGetResponse = {
  ok: true
  phone: PhoneState
  clock: PhoneClock
  location: PhoneLocation
  promos: PhonePromo[]
  bundles: typeof DATA_BUNDLES
  cash: number
}

export type PhoneBuyDataResponse = {
  ok: true
  phone: PhoneState
  cash: number
  ledgerId: string
  message: string
  replayed: boolean
}

export type PhoneChargeResponse = { ok: true; phone: PhoneState; message: string }
export type PhoneOpenResponse = { ok: true; phone: PhoneState; offline: boolean }
export type PhoneSettingsResponse = { ok: true; phone: PhoneState }

export type PhoneNotificationsResponse = {
  ok: true
  unread: Partial<Record<PhoneAppId, number>>
  newApps: PhoneAppId[]
  items: Array<{
    id: string
    appId: PhoneAppId
    title: string
    body: string
    createdAt: string
  }>
}

export type RideQuoteResponse = {
  ok: true
  from: string
  to: string
  quotes: Array<{ mode: RideMode; fare: number; minutes: number }>
}

export type RideTakeResponse = {
  ok: true
  state: unknown
  fare: number
  cash: number
  ledgerId: string
  message: string
  replayed: boolean
}

function asFail(res: { ok: false; code: string; error: string; status?: number }): ApiFail {
  return { ok: false, code: res.code, error: res.error, status: res.status ?? 400 }
}

export async function getPhone(): Promise<PhoneGetResponse | ApiFail> {
  if (useMocks()) {
    const res = mockGetPhone()
    return res.ok ? (res as PhoneGetResponse) : asFail(res)
  }
  return apiGet('/phone')
}

export async function buyData(
  bundleId: DataBundleId,
  idempotencyKey: string,
): Promise<PhoneBuyDataResponse | ApiFail> {
  if (useMocks()) {
    const res = mockBuyData(bundleId, idempotencyKey)
    return res.ok ? (res as PhoneBuyDataResponse) : asFail(res as { ok: false; code: string; error: string; status?: number })
  }
  return apiPost('/phone/data/buy', { bundleId, idempotencyKey })
}

export async function charge(action: 'start' | 'stop'): Promise<PhoneChargeResponse | ApiFail> {
  if (useMocks()) {
    const res = mockCharge(action)
    return res.ok ? res : asFail(res)
  }
  return apiPost('/phone/charge', { action })
}

export async function openApp(appId: PhoneAppId): Promise<PhoneOpenResponse | ApiFail> {
  if (useMocks()) {
    const res = mockOpenApp(appId)
    return res.ok ? res : asFail(res)
  }
  return apiPost('/phone/open', { appId })
}

export async function setWallpaper(wallpaper: WallpaperId): Promise<PhoneSettingsResponse | ApiFail> {
  if (useMocks()) {
    const res = mockSetWallpaper(wallpaper)
    return res.ok ? res : asFail(res)
  }
  return apiPatch('/phone/settings', { wallpaper })
}

export async function getNotifications(): Promise<PhoneNotificationsResponse | ApiFail> {
  if (useMocks()) {
    const res = mockListNotifications()
    return res.ok ? res : asFail(res)
  }
  return apiGet('/phone/notifications')
}

export async function getRideQuote(to: string): Promise<RideQuoteResponse | ApiFail> {
  if (useMocks()) {
    const res = mockRideQuote(to)
    return res.ok ? res : asFail(res)
  }
  return apiGet(`/ride/quote?to=${encodeURIComponent(to)}`)
}

export async function takeRide(
  to: string,
  mode: RideMode,
  idempotencyKey: string,
): Promise<RideTakeResponse | ApiFail> {
  if (useMocks()) {
    const res = mockTakeRide(to, mode, idempotencyKey)
    return res.ok ? (res as RideTakeResponse) : asFail(res as { ok: false; code: string; error: string; status?: number })
  }
  return apiPost('/ride', { to, mode, idempotencyKey })
}

/** @deprecated use getPhone — kept for callers mid-migration */
export const fetchPhone = getPhone

import { apiGet, apiPost, apiPut, useMocks } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import type { ServerGameState } from './game-api'
import * as mock from './room-mock'
import type { FurnitureItem, RoomItem, RoomState, RoomStyle, Rotation } from './room-types'

export type RoomFail = ApiFail & {
  code?: string
  uid?: string
  room?: RoomState
}

/** Which street template and lot your house is on */
export type HomeLot = { lodgingId: string; houseNumber: number | null }

type OkRoom = { ok: true; room: RoomState; catalog: FurnitureItem[]; home?: HomeLot }
type OkVisit = { ok: true; room: RoomState; readOnly: true }
type OkBuy = {
  ok: true
  room: RoomState
  state: ServerGameState
  bought: RoomItem[]
  message: string
}
type OkLayout = { ok: true; room: RoomState }
type OkStyle = {
  ok: true
  room: RoomState
  state: ServerGameState
  charged: number
  message: string
}
type OkSell = {
  ok: true
  room: RoomState
  state: ServerGameState
  refunded: number
  message: string
}

/** One UUID per user intent — reuse on retry, never regenerate per fetch attempt. */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function idemHeaders(key: string) {
  return { 'Idempotency-Key': key }
}

function mapMock<T extends { ok: true }>(
  result: { status: number; body: unknown },
): T | RoomFail {
  const body = result.body as T | RoomFail
  if (result.status >= 200 && result.status < 300 && body && 'ok' in body && body.ok) {
    return body as T
  }
  const fail = (body && typeof body === 'object' ? body : {}) as RoomFail
  return {
    ok: false,
    error: fail.error || 'Request failed.',
    code: fail.code as RoomFail['code'],
    uid: fail.uid,
    room: fail.room,
    conflict: fail.code === 'VERSION_CONFLICT',
    status: result.status,
  }
}

export async function fetchRoom(): Promise<OkRoom | RoomFail> {
  if (useMocks()) return mock.mockGetRoom()
  return apiGet<OkRoom>('/room')
}

export async function fetchVisitRoom(username: string): Promise<OkVisit | RoomFail> {
  if (useMocks()) {
    const result = mock.mockVisitRoom(username)
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        code: result.code,
        status: result.status,
      }
    }
    return result
  }
  return apiGet<OkVisit>(`/room/${encodeURIComponent(username)}`)
}

export async function buyRoomItem(
  itemId: string,
  qty: number,
  idempotencyKey: string,
): Promise<OkBuy | RoomFail> {
  if (useMocks()) return mapMock<OkBuy>(mock.mockBuyRoomItem(itemId, qty, idempotencyKey))
  return apiPost<OkBuy>('/room/buy', { itemId, qty }, idemHeaders(idempotencyKey))
}

export async function saveRoomLayout(
  version: number,
  items: { uid: string; placed: boolean; x: number; z: number; rotation: Rotation }[],
  idempotencyKey: string,
): Promise<OkLayout | RoomFail> {
  if (useMocks()) return mapMock<OkLayout>(mock.mockSaveLayout(version, items, idempotencyKey))
  return apiPut<OkLayout>('/room/layout', { version, items }, idemHeaders(idempotencyKey))
}

export async function saveRoomStyle(
  version: number,
  patch: { wallColor?: string; floorId?: RoomStyle['floorId'] },
  idempotencyKey: string,
): Promise<OkStyle | RoomFail> {
  if (useMocks()) return mapMock<OkStyle>(mock.mockSaveStyle(version, patch, idempotencyKey))
  return apiPut<OkStyle>('/room/style', { version, ...patch }, idemHeaders(idempotencyKey))
}

export async function sellRoomItem(
  uid: string,
  idempotencyKey: string,
): Promise<OkSell | RoomFail> {
  if (useMocks()) return mapMock<OkSell>(mock.mockSellRoomItem(uid, idempotencyKey))
  return apiPost<OkSell>('/room/sell', { uid }, idemHeaders(idempotencyKey))
}

export function friendlyRoomError(fail: RoomFail | string) {
  if (typeof fail === 'string') return fail
  return fail.error || 'Something went wrong. Try again.'
}

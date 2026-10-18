/**
 * In-process My Room mock — same rules/comfort as backend.
 * Enabled via NEXT_PUBLIC_USE_MOCKS (or economy mock alias).
 */
import { defaultNeeds } from './needs-defaults'
import type { ServerGameState } from './game-api'
import {
  DEFAULT_ROOM_STYLE,
  FLOOR_PRICE,
  FURNITURE_BY_ID,
  FURNITURE_CATALOG,
  PAINT_PRICE,
  ROOM_TIERS,
  ROOM_WALL_COLORS,
  STARTER_ITEMS,
} from './room-constants'
import { computeComfort, validateLayout } from './room-rules'
import type {
  FurnitureItem,
  LodgingId,
  RoomItem,
  RoomState,
  RoomStyle,
  Rotation,
} from './room-types'

type IdemRecord = { status: number; body: unknown; bodyKey: string }

let lodgingId: LodgingId = 'hostel-poultry'
let cash = 25_000
let version = 1
let style: RoomStyle = { ...DEFAULT_ROOM_STYLE }
let ownedFloors = new Set<RoomStyle['floorId']>(['cement'])
let items: RoomItem[] = []
let username = 'player'
const idempotency = new Map<string, IdemRecord>()
let uidSeq = 1

function freshItems(): RoomItem[] {
  return STARTER_ITEMS.map((itemId) => ({
    uid: `ri_starter_${itemId}`,
    itemId,
    placed: true,
    x: 0,
    z: 0,
    rotation: 0 as Rotation,
  }))
}

items = freshItems()

function tier() {
  return ROOM_TIERS[lodgingId]
}

function buildRoom(): RoomState {
  const t = tier()
  return {
    ownerUsername: username,
    tier: t,
    style: { ...style },
    items: items.map((row) => ({ ...row })),
    comfort: computeComfort(items, FURNITURE_BY_ID, t, style),
    version,
  }
}

function snapshot(message?: string): ServerGameState {
  const needs = defaultNeeds()
  return {
    ok: true,
    cash,
    needs,
    locationId: lodgingId,
    gameTime: 12 * 60,
    day: 1,
    period: 'afternoon',
    timeLabel: '12:00 PM',
    mood: { emoji: '😊', label: 'Fine', tone: 'good', score: 70 },
    dreamProgress: null,
    upNext: { actionId: 'sleep', placeId: lodgingId, need: 'energy', label: 'Sleep' },
    version: 1,
    places: [],
    message,
  }
}

function bodyKey(body: unknown) {
  return JSON.stringify(body ?? {})
}

function recallIdem(key: string | undefined, body: unknown): IdemRecord | null {
  if (!key) return null
  const hit = idempotency.get(key)
  if (!hit) return null
  if (hit.bodyKey !== bodyKey(body)) {
    return {
      status: 409,
      body: { ok: false, error: 'IDEMPOTENCY_CONFLICT', code: 'IDEMPOTENCY_CONFLICT' },
      bodyKey: hit.bodyKey,
    }
  }
  return hit
}

function storeIdem(key: string | undefined, requestBody: unknown, status: number, response: unknown) {
  if (!key) return
  idempotency.set(key, { status, body: response, bodyKey: bodyKey(requestBody) })
}

export function resetRoomMock(opts?: { lodgingId?: LodgingId; cash?: number; username?: string }) {
  lodgingId = opts?.lodgingId ?? 'hostel-poultry'
  cash = opts?.cash ?? 25_000
  username = opts?.username ?? 'player'
  version = 1
  style = { ...DEFAULT_ROOM_STYLE }
  ownedFloors = new Set(['cement'])
  items = freshItems()
  uidSeq = 1
  idempotency.clear()
}

export function mockGetRoom() {
  return { ok: true as const, room: buildRoom(), catalog: FURNITURE_CATALOG as FurnitureItem[] }
}

export function mockVisitRoom(visitUsername: string) {
  if (visitUsername !== username) {
    return {
      ok: false as const,
      error: 'Room visits come with friends — soon!',
      code: 'VISITS_DISABLED' as const,
      status: 403,
    }
  }
  return { ok: true as const, room: buildRoom(), readOnly: true as const }
}

export function mockBuyRoomItem(
  itemId: string,
  qty = 1,
  idempotencyKey?: string,
): { status: number; body: unknown } {
  const body = { itemId, qty }
  const recalled = recallIdem(idempotencyKey, body)
  if (recalled && recalled.status !== 409) return { status: recalled.status, body: recalled.body }
  if (recalled?.status === 409) return { status: 409, body: recalled.body }
  if (!idempotencyKey) {
    return {
      status: 400,
      body: { ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    }
  }

  const def = FURNITURE_BY_ID.get(itemId)
  if (!def) {
    const fail = { ok: false, error: 'Item not found.', code: 'UNKNOWN_ITEM' }
    storeIdem(idempotencyKey, body, 404, fail)
    return { status: 404, body: fail }
  }
  if (def.minTier > tier().tier) {
    const fail = {
      ok: false,
      error: 'This one needs a bigger room. Upgrade your lodge to unlock it.',
      code: 'TIER_LOCKED',
    }
    storeIdem(idempotencyKey, body, 403, fail)
    return { status: 403, body: fail }
  }
  const count = items.filter((row) => row.itemId === itemId).length
  const take = Math.max(1, Math.min(5, Math.floor(qty)))
  if (count + take > def.maxPerRoom) {
    const fail = {
      ok: false,
      error: 'Your room is full of that one already.',
      code: 'TOO_MANY',
    }
    storeIdem(idempotencyKey, body, 400, fail)
    return { status: 400, body: fail }
  }
  const total = def.price * take
  if (cash < total) {
    const fail = {
      ok: false,
      error: 'Small shortfall — a couple of shifts and it\'s yours.',
      code: 'INSUFFICIENT_FUNDS',
    }
    storeIdem(idempotencyKey, body, 400, fail)
    return { status: 400, body: fail }
  }

  cash -= total
  const bought: RoomItem[] = []
  for (let i = 0; i < take; i++) {
    const row: RoomItem = {
      uid: `ri_${uidSeq++}`,
      itemId,
      placed: false,
      x: 0,
      z: 0,
      rotation: 0,
    }
    items.push(row)
    bought.push({ ...row })
  }
  version += 1
  const ok = {
    ok: true,
    room: buildRoom(),
    state: snapshot(`Bought ${def.name} for your room.`),
    bought,
    message: take === 1 ? `${def.name} is in storage. Place it when you're ready.` : `Bought ${take}× ${def.name}.`,
  }
  storeIdem(idempotencyKey, body, 200, ok)
  return { status: 200, body: ok }
}

export function mockSaveLayout(
  nextVersion: number,
  nextItems: { uid: string; placed: boolean; x: number; z: number; rotation: Rotation }[],
  idempotencyKey?: string,
): { status: number; body: unknown } {
  const body = { version: nextVersion, items: nextItems }
  const recalled = recallIdem(idempotencyKey, body)
  if (recalled && recalled.status !== 409) return { status: recalled.status, body: recalled.body }
  if (recalled?.status === 409) return { status: 409, body: recalled.body }
  if (!idempotencyKey) {
    return {
      status: 400,
      body: { ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    }
  }

  if (nextVersion !== version) {
    const fail = {
      ok: false,
      error: 'Your room changed on another device. We loaded the latest.',
      code: 'VERSION_CONFLICT',
      room: buildRoom(),
      conflict: true,
    }
    return { status: 409, body: fail }
  }

  const byUid = new Map(items.map((row) => [row.uid, row]))
  if (nextItems.length !== items.length) {
    const fail = { ok: false, error: 'NOT_OWNED', code: 'NOT_OWNED', uid: '' }
    storeIdem(idempotencyKey, body, 400, fail)
    return { status: 400, body: fail }
  }
  const layout: RoomItem[] = []
  for (const patch of nextItems) {
    const prev = byUid.get(patch.uid)
    if (!prev) {
      const fail = { ok: false, error: 'NOT_OWNED', code: 'NOT_OWNED', uid: patch.uid }
      storeIdem(idempotencyKey, body, 400, fail)
      return { status: 400, body: fail }
    }
    layout.push({
      ...prev,
      placed: patch.placed,
      x: patch.x,
      z: patch.z,
      rotation: patch.rotation,
    })
  }
  const check = validateLayout(layout, FURNITURE_BY_ID, tier())
  if (!check.ok) {
    const copy =
      check.code === 'OVERLAP'
        ? "Something's already there. Try another spot."
        : check.code === 'OUT_OF_BOUNDS'
          ? "That's past the wall, my guy."
          : check.code
    const fail = { ok: false, error: copy, code: check.code, uid: check.uid }
    storeIdem(idempotencyKey, body, 400, fail)
    return { status: 400, body: fail }
  }
  items = layout
  version += 1
  const ok = { ok: true, room: buildRoom() }
  storeIdem(idempotencyKey, body, 200, ok)
  return { status: 200, body: ok }
}

export function mockSaveStyle(
  nextVersion: number,
  patch: { wallColor?: string; floorId?: RoomStyle['floorId'] },
  idempotencyKey?: string,
): { status: number; body: unknown } {
  const body = { version: nextVersion, ...patch }
  const recalled = recallIdem(idempotencyKey, body)
  if (recalled && recalled.status !== 409) return { status: recalled.status, body: recalled.body }
  if (recalled?.status === 409) return { status: 409, body: recalled.body }
  if (!idempotencyKey) {
    return {
      status: 400,
      body: { ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    }
  }
  if (nextVersion !== version) {
    return {
      status: 409,
      body: {
        ok: false,
        error: 'Your room changed on another device. We loaded the latest.',
        code: 'VERSION_CONFLICT',
        room: buildRoom(),
        conflict: true,
      },
    }
  }

  let charged = 0
  const next = { ...style }
  if (patch.wallColor != null) {
    if (!(ROOM_WALL_COLORS as readonly string[]).includes(patch.wallColor)) {
      const fail = { ok: false, error: 'BAD_COLOR', code: 'BAD_COLOR' }
      storeIdem(idempotencyKey, body, 400, fail)
      return { status: 400, body: fail }
    }
    if (patch.wallColor !== style.wallColor) {
      if (patch.wallColor !== DEFAULT_ROOM_STYLE.wallColor) charged += PAINT_PRICE
      next.wallColor = patch.wallColor
    }
  }
  if (patch.floorId != null) {
    if (!tier().floorOptions.includes(patch.floorId)) {
      const fail = { ok: false, error: 'FLOOR_LOCKED', code: 'FLOOR_LOCKED' }
      storeIdem(idempotencyKey, body, 403, fail)
      return { status: 403, body: fail }
    }
    if (patch.floorId !== style.floorId) {
      if (!ownedFloors.has(patch.floorId)) charged += FLOOR_PRICE[patch.floorId]
      next.floorId = patch.floorId
      ownedFloors.add(patch.floorId)
    }
  }
  if (cash < charged) {
    const fail = {
      ok: false,
      error: 'Small shortfall — a couple of shifts and it\'s yours.',
      code: 'INSUFFICIENT_FUNDS',
    }
    storeIdem(idempotencyKey, body, 400, fail)
    return { status: 400, body: fail }
  }
  cash -= charged
  style = next
  version += 1
  const ok = {
    ok: true,
    room: buildRoom(),
    state: snapshot(charged ? 'Room looking fresh.' : 'Style updated.'),
    charged,
    message: charged ? (patch.floorId ? `New floor: ${patch.floorId}` : 'Repainted your room.') : 'Saved.',
  }
  storeIdem(idempotencyKey, body, 200, ok)
  return { status: 200, body: ok }
}

export function mockSellRoomItem(uid: string, idempotencyKey?: string): { status: number; body: unknown } {
  const body = { uid }
  const recalled = recallIdem(idempotencyKey, body)
  if (recalled && recalled.status !== 409) return { status: recalled.status, body: recalled.body }
  if (recalled?.status === 409) return { status: 409, body: recalled.body }
  if (!idempotencyKey) {
    return {
      status: 400,
      body: { ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    }
  }
  const row = items.find((entry) => entry.uid === uid)
  if (!row) {
    const fail = { ok: false, error: 'NOT_OWNED', code: 'NOT_OWNED', uid }
    storeIdem(idempotencyKey, body, 400, fail)
    return { status: 400, body: fail }
  }
  if (STARTER_ITEMS.includes(row.itemId) && row.uid.startsWith('ri_starter_')) {
    const fail = {
      ok: false,
      error: "Can't sell your starter mattress.",
      code: 'CANT_SELL_STARTER',
    }
    storeIdem(idempotencyKey, body, 400, fail)
    return { status: 400, body: fail }
  }
  const def = FURNITURE_BY_ID.get(row.itemId)
  const refunded = Math.floor((def?.price ?? 0) * 0.4)
  cash += refunded
  items = items.filter((entry) => entry.uid !== uid)
  version += 1
  const ok = {
    ok: true,
    room: buildRoom(),
    state: snapshot('Sold.'),
    refunded,
    message: `Sold for ₦${refunded.toLocaleString()}.`,
  }
  storeIdem(idempotencyKey, body, 200, ok)
  return { status: 200, body: ok }
}

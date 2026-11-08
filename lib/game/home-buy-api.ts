import { apiGet, apiPost, useMocks } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import type { ServerGameState } from './game-api'
import type { HomePlacement, HomeRotation } from './home-buy-rules'
import { newIdempotencyKey } from './room-api'
import type { DecorZone, HomeDecor } from './home-decor'

export type HomeCategory = 'sleep' | 'kitchen' | 'bath' | 'comfort' | 'study' | 'light' | 'deco'

export type HomeItem = {
  id: string
  name: string
  emoji: string
  category: HomeCategory
  price: number
  /** Size in tiles before turning. */
  w: number
  d: number
  wall: boolean
  /** Drawn height (m) and colour. */
  height: number
  color: string
  /** Needs it helps: Energy, Hunger, Hygiene, Fun, Study. */
  helps: string[]
  /** Existing furniture actions it gives (room-furniture.ts id). */
  uses: string | null
  /** Comes with the home: free, movable and removable, never in the shop. */
  starter?: boolean
  /** Its 3D model (public/models/furniture/…); null = drawn as a block. */
  model?: string | null
  /** For sale in the shop (block-only items aren't; ones already placed still show). */
  available?: boolean
  maxPerHome: number
  /** Colours it is sold in (a tint on the model). Missing or empty = one look only. */
  finishes?: HomeFinish[]
}

/** A ready-made look (see backend/sql/056_home_styles.sql): items in finishes, plus a wall paint and floor. */
export type HomeStyle = {
  id: string
  name: string
  emoji: string
  blurb: string
  wall: string | null
  floor: string | null
  items: { item: string; finish?: string | null }[]
}

export type HomeFinish = { n: string; c: string }

/** `finish` is a chosen finish colour (#rrggbb); null or missing = the model's own colours. */
export type OwnedPiece = HomePlacement & { paid?: number; finish?: string | null }

type OkOwn = { ok: true; enabled: boolean; lodgingId: string; catalog: HomeItem[]; placements: OwnedPiece[]; decor?: HomeDecor; decorZones?: DecorZone[]; styles?: HomeStyle[] }
type OkVisit = { ok: true; catalog: HomeItem[]; placements: OwnedPiece[]; decor?: HomeDecor }
type OkWrite = {
  ok: true
  placements: OwnedPiece[]
  state: ServerGameState
  message: string
  placedId?: string
  refunded?: number
}

export type HomeBuyFail = ApiFail & { reason?: string }

export { newIdempotencyKey }

const idem = (key: string) => ({ 'Idempotency-Key': key })

export async function fetchHomeFurniture(): Promise<OkOwn | HomeBuyFail> {
  if (useMocks()) return { ok: false, error: 'Buy mode needs the live game.' }
  return apiGet<OkOwn>('/home/furniture?starters=1')
}

export async function fetchVisitFurniture(username: string): Promise<OkVisit | HomeBuyFail> {
  if (useMocks()) return { ok: false, error: 'Buy mode needs the live game.' }
  return apiGet<OkVisit>(`/home/furniture/${encodeURIComponent(username)}?starters=1`)
}

/** Buy and place in one server transaction. One key per tap: reuse it if you retry. */
export async function placeHomeItem(
  itemId: string,
  spot: { x: number; z: number; rot: HomeRotation },
  key: string,
  finish?: string | null,
): Promise<OkWrite | HomeBuyFail> {
  return apiPost<OkWrite>('/home/place', { itemId, ...spot, ...(finish ? { finish } : {}) }, idem(key))
}

/** Move or turn a piece you own. `finish`: a colour to change it to, null for its own colours, undefined to keep it. */
export async function moveHomeItem(
  id: string,
  spot: { x: number; z: number; rot: HomeRotation },
  key: string,
  finish?: string | null,
): Promise<OkWrite | HomeBuyFail> {
  return apiPost<OkWrite>('/home/move', { id, ...spot, ...(finish === undefined ? {} : { finish }) }, idem(key))
}

export async function sellHomeItem(id: string, key: string): Promise<OkWrite | HomeBuyFail> {
  return apiPost<OkWrite>('/home/sell', { id }, idem(key))
}

/** Buy a wall paint / floor / kitchen & bath tiles (one key per tap). */
export async function buyHomeDecor(
  zone: DecorZone,
  value: string,
  key: string,
): Promise<{ ok: true; decor: HomeDecor; state: ServerGameState; message: string } | HomeBuyFail> {
  return apiPost('/home/decor', { zone, value }, idem(key))
}

/** Buy a whole style in one go: your own pieces are reused, missing ones bought, what doesn't fit skipped. */
export async function buyHomeStyle(
  styleId: string,
  key: string,
): Promise<{ ok: true; placements: OwnedPiece[]; decor: HomeDecor; state: ServerGameState; message: string } | HomeBuyFail> {
  return apiPost<{ ok: true; placements: OwnedPiece[]; decor: HomeDecor; state: ServerGameState; message: string }>('/home/style', { styleId }, idem(key))
}

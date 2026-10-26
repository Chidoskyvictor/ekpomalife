import { apiGet, apiPost, useMocks } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import type { ServerGameState } from './game-api'
import type { HomePlacement, HomeRotation } from './home-buy-rules'
import { newIdempotencyKey } from './room-api'

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
  maxPerHome: number
}

export type OwnedPiece = HomePlacement & { paid?: number }

type OkOwn = { ok: true; enabled: boolean; lodgingId: string; catalog: HomeItem[]; placements: OwnedPiece[] }
type OkVisit = { ok: true; catalog: HomeItem[]; placements: OwnedPiece[] }
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
  return apiGet<OkOwn>('/home/furniture')
}

export async function fetchVisitFurniture(username: string): Promise<OkVisit | HomeBuyFail> {
  if (useMocks()) return { ok: false, error: 'Buy mode needs the live game.' }
  return apiGet<OkVisit>(`/home/furniture/${encodeURIComponent(username)}`)
}

/** Buy and place in one server transaction. One key per tap: reuse it if you retry. */
export async function placeHomeItem(
  itemId: string,
  spot: { x: number; z: number; rot: HomeRotation },
  key: string,
): Promise<OkWrite | HomeBuyFail> {
  return apiPost<OkWrite>('/home/place', { itemId, ...spot }, idem(key))
}

export async function moveHomeItem(
  id: string,
  spot: { x: number; z: number; rot: HomeRotation },
  key: string,
): Promise<OkWrite | HomeBuyFail> {
  return apiPost<OkWrite>('/home/move', { id, ...spot }, idem(key))
}

export async function sellHomeItem(id: string, key: string): Promise<OkWrite | HomeBuyFail> {
  return apiPost<OkWrite>('/home/sell', { id }, idem(key))
}

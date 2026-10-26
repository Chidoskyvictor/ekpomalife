import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'

/**
 * Minimal LiveKit server client: HS256 access tokens, a few RoomService calls (Twirp over
 * HTTPS) and webhook checks. No SDK so the backend stays small. We never start egress —
 * Spaces audio is never recorded.
 */

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string }

export function liveKitConfig(): LiveKitConfig | null {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null
  return { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET }
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

/** Verify an HS256 JWT (signature, nbf/exp) and return its claims, or null. */
export function verifyJwt(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')) as { alg?: string }
    if (header.alg !== 'HS256') return null
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof claims.exp === 'number' && claims.exp < nowSec - 10) return null
    if (typeof claims.nbf === 'number' && claims.nbf > nowSec + 10) return null
    return claims
  } catch {
    return null
  }
}

export const roomName = (spaceId: string) => `space_${spaceId}`
export const spaceIdFromRoom = (room: string) => (room.startsWith('space_') ? room.slice('space_'.length) : null)

/** Join token: everyone can listen; only `canPublish` people get the microphone. */
export function joinToken(
  cfg: LiveKitConfig,
  input: { spaceId: string; userId: string; name: string; canPublish: boolean; ttlSeconds: number; metadata?: string },
  nowSec = Math.floor(Date.now() / 1000),
): string {
  return signJwt(
    {
      iss: cfg.apiKey,
      sub: input.userId,
      name: input.name,
      nbf: nowSec - 5,
      exp: nowSec + Math.max(60, Math.floor(input.ttlSeconds)),
      metadata: input.metadata ?? '',
      video: {
        room: roomName(input.spaceId),
        roomJoin: true,
        canSubscribe: true,
        canPublish: input.canPublish,
        canPublishSources: input.canPublish ? ['microphone'] : [],
        canPublishData: false,
        canUpdateOwnMetadata: false,
        // Belt and braces: no recording from a client token either
        recorder: false,
      },
    },
    cfg.apiSecret,
  )
}

function adminToken(cfg: LiveKitConfig, room?: string): string {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { iss: cfg.apiKey, sub: 'ekpoma-api', nbf: now - 5, exp: now + 60, video: { roomCreate: true, roomList: true, roomAdmin: true, ...(room ? { room } : {}) } },
    cfg.apiSecret,
  )
}

function httpBase(url: string): string {
  return url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/+$/, '')
}

async function roomService<T>(cfg: LiveKitConfig, method: string, body: Record<string, unknown>, room?: string): Promise<T> {
  const res = await fetch(`${httpBase(cfg.url)}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken(cfg, room)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`LiveKit ${method} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

/** Make the room up front so LiveKit itself also closes it after 5 empty minutes. */
export function createRoom(cfg: LiveKitConfig, spaceId: string, maxParticipants: number) {
  return roomService(cfg, 'CreateRoom', {
    name: roomName(spaceId),
    empty_timeout: 5 * 60,
    departure_timeout: 5 * 60,
    max_participants: maxParticipants,
  })
}

export async function listParticipants(cfg: LiveKitConfig, spaceId: string): Promise<string[]> {
  const out = await roomService<{ participants?: { identity: string }[] }>(cfg, 'ListParticipants', { room: roomName(spaceId) }, roomName(spaceId))
  return (out.participants ?? []).map((p) => p.identity)
}

export function setPublish(cfg: LiveKitConfig, spaceId: string, identity: string, canPublish: boolean) {
  return roomService(
    cfg,
    'UpdateParticipant',
    {
      room: roomName(spaceId),
      identity,
      permission: {
        can_subscribe: true,
        can_publish: canPublish,
        can_publish_data: false,
        can_publish_sources: canPublish ? ['MICROPHONE'] : [],
      },
    },
    roomName(spaceId),
  )
}

export function removeParticipant(cfg: LiveKitConfig, spaceId: string, identity: string) {
  return roomService(cfg, 'RemoveParticipant', { room: roomName(spaceId), identity }, roomName(spaceId))
}

export function deleteRoom(cfg: LiveKitConfig, spaceId: string) {
  return roomService(cfg, 'DeleteRoom', { room: roomName(spaceId) }, roomName(spaceId))
}

export type WebhookEvent = {
  event?: string
  room?: { name?: string }
  participant?: { identity?: string }
}

/** LiveKit signs webhooks: Authorization is a JWT whose `sha256` claim is the body's base64 SHA-256. */
export function verifyWebhook(cfg: LiveKitConfig, rawBody: string, authorization: string | undefined): WebhookEvent | null {
  if (!authorization) return null
  const claims = verifyJwt(authorization.replace(/^Bearer\s+/i, ''), cfg.apiSecret)
  if (!claims || claims.iss !== cfg.apiKey) return null
  const hash = createHash('sha256').update(rawBody).digest('base64')
  if (claims.sha256 !== hash) return null
  try {
    return JSON.parse(rawBody) as WebhookEvent
  } catch {
    return null
  }
}

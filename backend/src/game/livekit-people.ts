import { createHmac } from 'node:crypto'
import type { LiveKitConfig } from './livekit.js'

/** Identities (user ids) connected to a room right now. */
export async function listRoomIdentities(cfg: LiveKitConfig, room: string): Promise<string[]> {
  const b64 = (s: string) => Buffer.from(s).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64(JSON.stringify({ iss: cfg.apiKey, sub: 'ekpoma-api', nbf: now - 5, exp: now + 60, video: { roomList: true, roomAdmin: true, room } }))
  const sig = createHmac('sha256', cfg.apiSecret).update(`${head}.${body}`).digest('base64url')
  try {
    const res = await fetch(`${cfg.url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/+$/, '')}/twirp/livekit.RoomService/ListParticipants`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${head}.${body}.${sig}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ room }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const out = (await res.json()) as { participants?: { identity: string }[] }
    return (out.participants ?? []).map((p) => p.identity)
  } catch {
    return []
  }
}

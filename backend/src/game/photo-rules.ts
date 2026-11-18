/** Pure rules for view-once chat photos (no database or storage). */

/** The phone shrinks photos to ~200KB; this is the most we accept. */
export const PHOTO_MAX_BYTES = 600_000
export const PHOTO_MAX_EDGE = 2000
/** Unopened photos are deleted after this long. */
export const PHOTO_UNOPENED_DAYS = 7
/** A reported photo is kept hidden this long for support. */
export const PHOTO_REPORT_DAYS = 30
/** The one-time view link lives this long. */
export const PHOTO_TOKEN_MS = 60_000
/** After opening, the server keeps the bytes this long in memory only so a report can preserve them. */
export const PHOTO_HOLD_MS = 10 * 60_000

export type PhotoStatus = 'sent' | 'opened' | 'reported' | 'expired' | 'purged'

/** The image type from its first bytes (never trust the header), or null. */
export function sniffPhoto(buf: Buffer): { ext: 'jpg' | 'webp'; type: string } | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' }
  }
  return null
}

export const photoContentType = (key: string): string => (key.endsWith('.webp') ? 'image/webp' : 'image/jpeg')

/** What a photo message's body holds: size only. `state` is added when a message is read. */
export type PhotoBody = { w: number; h: number; state: 'sent' | 'opened' | 'expired' }

export function photoBody(w: number, h: number): string {
  const clamp = (n: number) => Math.min(PHOTO_MAX_EDGE, Math.max(16, Math.round(Number.isFinite(n) ? n : 100)))
  return JSON.stringify({ w: clamp(w), h: clamp(h) })
}

/** Public state shown on the bubble. Reported counts as opened for the viewer. */
export const publicPhotoState = (status: PhotoStatus): PhotoBody['state'] =>
  status === 'sent' ? 'sent' : status === 'expired' || status === 'purged' ? 'expired' : 'opened'

export const isoDaysAgo = (now: Date, days: number): Date => new Date(now.getTime() - days * 86_400_000)

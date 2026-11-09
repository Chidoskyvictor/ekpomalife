/** Pure rules for chat voice notes (no database or storage). */

/** Longest voice note, in milliseconds. */
export const VOICE_MAX_MS = 60_000
/** Shortest note worth sending (a mis-tap otherwise). */
export const VOICE_MIN_MS = 700
/** Upload cap: 60 s of Opus/AAC at the recorder's bitrate is well under this. */
export const VOICE_MAX_BYTES = 1_500_000
/** Bars in the waveform drawn on the bubble. */
export const VOICE_BARS = 32

/** Recorder formats we accept: Chrome/Android record WebM/Opus, iPhone Safari records MP4/AAC. */
const TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
}

/** The file extension for an uploaded content type (codec parameters ignored), or null if not allowed. */
export function voiceExt(contentType: string | undefined): string | null {
  const base = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  return TYPES[base] ?? null
}

/** The content type to serve a stored note with, from its key's extension. */
export function voiceContentType(key: string): string {
  const ext = key.split('.').pop()
  const found = Object.entries(TYPES).find(([, e]) => e === ext)
  return found ? found[0] : 'application/octet-stream'
}

/** What a voice message's body holds (stored as JSON in chat_messages.body). */
export type VoiceBody = { key: string; ms: number; peaks: number[] }

/** Waveform from the client: VOICE_BARS numbers 0..1 (anything else is replaced by a flat line). */
export function cleanPeaks(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const nums = list.slice(0, VOICE_BARS).map((v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 100) / 100 : 0.3
  })
  while (nums.length < VOICE_BARS) nums.push(0.3)
  return nums
}

/** A voice note's body, or null when it is malformed. */
export function parseVoiceBody(body: string): VoiceBody | null {
  try {
    const v = JSON.parse(body) as Partial<VoiceBody>
    if (typeof v.key !== 'string' || typeof v.ms !== 'number') return null
    return { key: v.key, ms: v.ms, peaks: cleanPeaks(v.peaks) }
  } catch {
    return null
  }
}

/** "0:07", "1:00" */
export function voiceLabel(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

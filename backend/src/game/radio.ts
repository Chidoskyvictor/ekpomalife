/*
 * Naija Radio station list. The API key stays on the server; players get a cleaned list.
 * The list is cached for a few minutes so we stay well inside the provider's rate limit.
 */

export type RadioStation = {
  id: string
  name: string
  streamUrl: string
  logo: string | null
  city: string | null
  genre: string | null
  frequency: string | null
}

const API = 'https://fm.puzzofme.com/api/v1/stations'
const CACHE_MS = 10 * 60 * 1000

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = str(o[k])
    if (v) return v
  }
  return null
}

/** Accepts the provider's station objects whatever their exact field names, keeps only playable https streams. */
export function normaliseStations(body: unknown): RadioStation[] {
  const root = body as Record<string, unknown> | unknown[] | null
  const list: unknown[] = Array.isArray(root)
    ? root
    : root && typeof root === 'object'
      ? ((['stations', 'data', 'results', 'items'].map((k) => (root as Record<string, unknown>)[k]).find(Array.isArray) as unknown[]) ?? [])
      : []
  const out: RadioStation[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const streamUrl = pick(o, ['streamUrl', 'stream_url', 'stream', 'url_resolved', 'url', 'streamURL', 'audio'])
    const name = pick(o, ['name', 'title', 'station', 'stationName'])
    if (!streamUrl || !name || !/^https:\/\//i.test(streamUrl)) continue
    const id = pick(o, ['id', 'slug', 'uuid', 'stationuuid']) ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      streamUrl,
      logo: pick(o, ['logo', 'logoUrl', 'logo_url', 'image', 'favicon', 'artwork']),
      city: pick(o, ['city', 'location', 'state', 'region']),
      genre: pick(o, ['genre', 'category', 'tags']),
      frequency: pick(o, ['frequency', 'freq', 'band']),
    })
  }
  return out
}

let cache: { at: number; stations: RadioStation[] } | null = null

export async function getStations(apiKey: string | undefined, now = Date.now()): Promise<{ ok: true; stations: RadioStation[] } | { ok: false; code: number; error: string }> {
  if (!apiKey) return { ok: false, code: 503, error: 'Radio is not set up yet.' }
  if (cache && now - cache.at < CACHE_MS) return { ok: true, stations: cache.stations }
  const res = await fetch(API, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    if (cache) return { ok: true, stations: cache.stations } // serve the last good list
    return { ok: false, code: 502, error: 'Radio stations are unavailable right now.' }
  }
  const stations = normaliseStations(await res.json())
  cache = { at: now, stations }
  return { ok: true, stations }
}

export function clearRadioCache() {
  cache = null
}

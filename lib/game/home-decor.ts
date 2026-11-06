/*
 * Home design: wall paint, floor and kitchen & bathroom tiles. Kept in step with
 * backend/src/game/home-decor.ts (same ids, prices and colours: the server charges, the app draws).
 *
 * What each home can change:
 *   single room: walls + floor (its wooden planks); it has no kitchen or bathroom tiles
 *   self-con, one bedroom: walls + floor + kitchen & bathroom tiles
 *   hostel bunk: nothing (a shared room)
 */

export type DecorZone = 'wall' | 'floor' | 'tiles'
/** A preset id, or "#rrggbb" for your own colour. Unset = the home's own look. */
export type HomeDecor = Partial<Record<DecorZone, string>>

export type DecorPaint = { id: string; name: string; hex: string; price: number }
/** Floors are laid as a two-colour checker (a, b). */
export type DecorFloor = { id: string; name: string; a: string; b: string; price: number }

export const DECOR_PAINTS: DecorPaint[] = [
  { id: 'classic-cream', name: 'Classic Cream', hex: '#efe4cf', price: 3000 },
  { id: 'aau-sky', name: 'AAU Sky', hex: '#a9d3f0', price: 3000 },
  { id: 'mint-fresh', name: 'Mint Fresh', hex: '#a8e0c4', price: 3000 },
  { id: 'peach-glow', name: 'Peach Glow', hex: '#f6c7a5', price: 3000 },
  { id: 'soft-lilac', name: 'Soft Lilac', hex: '#cdbbe8', price: 3000 },
  { id: 'naija-green', name: 'Naija Green', hex: '#3f9a5c', price: 4000 },
  { id: 'ekpoma-charcoal', name: 'Ekpoma Charcoal', hex: '#4a4f57', price: 5000 },
  { id: 'owambe-gold', name: 'Owambe Gold', hex: '#d9a93b', price: 6000 },
]

export const DECOR_FLOORS: DecorFloor[] = [
  { id: 'terrazzo', name: 'Terrazzo', a: '#d8d2c4', b: '#bfb7a6', price: 5000 },
  { id: 'wood-parquet', name: 'Wood Parquet', a: '#a8683a', b: '#8a5228', price: 8000 },
  { id: 'white-marble', name: 'White Marble', a: '#f1f0ec', b: '#dcdad4', price: 12000 },
  { id: 'black-marble', name: 'Black Marble', a: '#3b3d42', b: '#24262a', price: 15000 },
  { id: 'blue-ceramic', name: 'Blue Ceramic', a: '#b9d6ec', b: '#93bcdc', price: 6000 },
  { id: 'checkerboard', name: 'Checkerboard', a: '#f2f2ef', b: '#1f2023', price: 7000 },
  { id: 'terracotta', name: 'Terracotta', a: '#c8714a', b: '#a8583a', price: 6000 },
]

/** Your own colour, any zone. */
export const DECOR_CUSTOM_PRICE = 6000

const HEX = /^#[0-9a-f]{6}$/i

/** Which layout a lodging gets (same as layoutForLodging in room-layouts.ts). */
function layoutOf(lodgingId: string | null | undefined): 'hostel' | 'single-room' | 'selfcon' | 'one-bedroom' {
  if (lodgingId === 'hostel-poultry') return 'hostel'
  if (lodgingId === 'selfcon-g2') return 'selfcon'
  if (lodgingId === 'onebed-ojo') return 'one-bedroom'
  return 'single-room'
}

/** The zones this home can change. */
export function decorZones(lodgingId: string | null | undefined): DecorZone[] {
  const layout = layoutOf(lodgingId)
  if (layout === 'hostel') return []
  if (layout === 'single-room') return ['wall', 'floor']
  return ['wall', 'floor', 'tiles']
}

/** Price of putting `value` on `zone`, or null when it isn't a real choice. */
export function decorPrice(zone: DecorZone, value: string): number | null {
  if (HEX.test(value)) return DECOR_CUSTOM_PRICE
  if (zone === 'wall') return DECOR_PAINTS.find((p) => p.id === value)?.price ?? null
  return DECOR_FLOORS.find((f) => f.id === value)?.price ?? null
}

/** The name shown for a choice. */
export function decorName(zone: DecorZone, value: string): string {
  if (HEX.test(value)) return 'Your own colour'
  if (zone === 'wall') return DECOR_PAINTS.find((p) => p.id === value)?.name ?? value
  return DECOR_FLOORS.find((f) => f.id === value)?.name ?? value
}

/** Only known zones with valid values (anything else from storage is dropped). */
export function cleanDecor(raw: unknown): HomeDecor {
  if (!raw || typeof raw !== 'object') return {}
  const out: HomeDecor = {}
  for (const zone of ['wall', 'floor', 'tiles'] as const) {
    const value = (raw as Record<string, unknown>)[zone]
    if (typeof value === 'string' && decorPrice(zone, value) !== null) out[zone] = value.toLowerCase()
  }
  return out
}

/** The same colour a little darker (factor < 1). */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor))).toString(16).padStart(2, '0')
  return `#${c(16)}${c(8)}${c(0)}`
}

/** Wall hex for a paint value. */
export function wallHex(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (HEX.test(value)) return value.toLowerCase()
  return DECOR_PAINTS.find((p) => p.id === value)?.hex
}

/** The two checker colours for a floor / tiles value. */
export function floorColours(value: string | undefined): [string, string] | undefined {
  if (!value) return undefined
  if (HEX.test(value)) return [value.toLowerCase(), shade(value, 0.86)]
  const f = DECOR_FLOORS.find((x) => x.id === value)
  return f ? [f.a, f.b] : undefined
}

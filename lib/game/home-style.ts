import type { HomeItem, HomeStyle, OwnedPiece } from './home-buy-api'
import { DECOR_FLOORS, DECOR_PAINTS, decorPrice, decorZones, type DecorZone, type HomeDecor } from './home-decor'
import { normalizeLodging } from './home-lodging'
import { planStyleLayout, type StyleItem, type StylePlan, type StyleScope } from './home-style-layout'
import type { HomeSpec } from './home-buy-rules'

/*
 * What a style would do to this home right now: same layout code as the server (planStyleLayout),
 * so the preview and the price match what Use does. Pieces you own (placed or in storage) are
 * reused; only the missing ones are paid for.
 */
export type StyleQuote = {
  plan: StylePlan
  /** Naira for the missing pieces. */
  piecesCost: number
  /** Naira for wall paint / floor the style changes (whole-home only; 0 when you already have them). */
  decorCost: number
  /** The wall / floor the style sets (only zones this home has and doesn't have already). */
  decor: HomeDecor
  total: number
}

export function quoteStyle(
  style: HomeStyle,
  spec: HomeSpec,
  catalog: HomeItem[],
  placements: OwnedPiece[],
  stored: OwnedPiece[],
  lodgingId: string | null | undefined,
  ownedDecor: HomeDecor,
  scope: StyleScope = 'home',
): StyleQuote {
  const byId = new Map(catalog.map((i) => [i.id, i]))
  // Same filter as the server: only things for sale can be bought; owned ones are reused anyway
  const entries = style.items.filter((e) => {
    const item = byId.get(e.item)
    return item && !item.starter && (item.available !== false || [...placements, ...stored].some((p) => p.itemId === e.item))
  })
  const items = new Map<string, StyleItem>(
    catalog.map((i) => [i.id, { id: i.id, w: i.w, d: i.d, wall: i.wall, maxPerHome: i.maxPerHome, category: i.category, uses: i.uses }]),
  )
  const plan = planStyleLayout({ lodgingId: normalizeLodging(lodgingId), spec, items, active: placements, stored, entries, scope })
  const piecesCost = plan.buys.reduce((sum, b) => sum + (byId.get(b.itemId)?.price ?? 0), 0)
  const zones = decorZones(lodgingId)
  const decor: HomeDecor = {}
  let decorCost = 0
  for (const zone of (scope === 'home' ? ['wall', 'floor'] : []) as ('wall' | 'floor')[] satisfies DecorZone[]) {
    const value = style[zone]
    if (!value || !zones.includes(zone) || ownedDecor[zone] === value) continue
    const price = decorPrice(zone, value)
    if (price === null) continue
    decor[zone] = value
    decorCost += price
  }
  return { plan, piecesCost, decorCost, decor, total: piecesCost + decorCost }
}

/** Up to four different item pictures for a style card (the first items it lists). */
export function styleItems(style: HomeStyle, catalog: HomeItem[]): HomeItem[] {
  const byId = new Map(catalog.map((i) => [i.id, i]))
  const seen = new Map<string, HomeItem>()
  for (const e of style.items) {
    const item = byId.get(e.item)
    if (item && !seen.has(item.id)) seen.set(item.id, item)
    if (seen.size >= 4) break
  }
  return [...seen.values()]
}

/** A style's own palette for its card: wall, floor and the main finish colour (with sensible fallbacks). */
export function stylePalette(style: HomeStyle): { wall: string; floorA: string; floorB: string; main: string } {
  const paint = DECOR_PAINTS.find((p) => p.id === style.wall)
  const floor = DECOR_FLOORS.find((f) => f.id === style.floor)
  const finishes = style.items.map((i) => i.finish).filter((f): f is string => !!f)
  const main = finishes[0] ?? '#a9744f'
  return {
    wall: paint?.hex ?? '#e8e1d2',
    floorA: floor?.a ?? finishes[1] ?? '#cfc6b4',
    floorB: floor?.b ?? finishes[1] ?? '#b5ab97',
    main,
  }
}

/** "about ₦1.2m" / "about ₦85k": rounded, since the price shifts with what you already own. */
export function aboutNaira(n: number): string {
  if (n >= 1_000_000) return `about ₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`
  if (n >= 1000) return `about ₦${Math.round(n / 1000).toLocaleString('en-NG')}k`
  return `about ₦${n.toLocaleString('en-NG')}`
}
